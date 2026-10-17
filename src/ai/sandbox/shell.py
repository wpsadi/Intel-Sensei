# Runs inside Pyodide. A small shell (pipes, redirects, && || ;) over the in-memory filesystem, plus a Python runner.
# Both keep their state (current folder, Python variables, files) between calls.
import asyncio, contextlib, fnmatch, glob, inspect, io, ipaddress, json, os, re, shlex, shutil, stat as statmod, sys, time, traceback, zipfile
from urllib.parse import unquote, urlparse

HOME = "/home/user"
OUTPUT_LIMIT = 30000
FETCH_LIMIT = 30 * 1024 * 1024
os.environ["HOME"] = HOME
os.makedirs(HOME, exist_ok=True)
os.chdir(HOME)


class Fail(Exception):
    pass


def clip(text, limit=OUTPUT_LIMIT):
    if len(text) <= limit:
        return text
    head, tail = int(limit * 0.6), int(limit * 0.4)
    return f"{text[:head]}\n[... {len(text) - head - tail} characters left out; narrow the command, or use head, tail or grep ...]\n{text[-tail:]}"


def human(size):
    for unit in ("B", "K", "M", "G"):
        if size < 1024 or unit == "G":
            return f"{size:.0f}{unit}" if unit == "B" else f"{size:.1f}{unit}"
        size /= 1024


def opts(args, valued=""):
    """Splits arguments into flags, flag values and plain arguments. `-5` counts as the value of `n`."""
    flags, values, rest = set(), {}, []
    i = 0
    while i < len(args):
        a = args[i]
        i += 1
        if a == "--":
            rest += args[i:]
            break
        if re.fullmatch(r"-\d+", a):
            values["n"] = a[1:]
        elif a.startswith("--") and len(a) > 2:
            flags.add(a[2:])
        elif a.startswith("-") and len(a) > 1:
            for k, ch in enumerate(a[1:], 1):
                if ch in valued:
                    rest_of = a[k + 1:]
                    if rest_of:
                        values[ch] = rest_of
                    elif i < len(args):
                        values[ch] = args[i]
                        i += 1
                    else:
                        raise Fail(f"option -{ch} needs a value")
                    break
                flags.add(ch)
        else:
            rest.append(a)
    return flags, values, rest


def read_text(path):
    if os.path.isdir(path):
        raise Fail(f"{path}: Is a directory")
    if not os.path.exists(path):
        raise Fail(f"{path}: No such file or directory")
    with open(path, "rb") as f:
        return f.read().decode("utf-8", errors="replace")


def inputs(paths, stdin, name):
    """The text of each file, or of standard input when no file is named."""
    if paths:
        return [(p, read_text(p)) for p in paths]
    if stdin is None:
        raise Fail(f"{name}: no file given")
    return [("-", stdin)]


def lines_of(text):
    return text.splitlines()


def join(lines):
    return "\n".join(lines) + ("\n" if lines else "")


def c_pwd(args, stdin):
    return os.getcwd() + "\n"


def c_cd(args, stdin):
    target = os.path.expanduser(args[0]) if args else HOME
    if not os.path.isdir(target):
        raise Fail(f"{target}: No such directory")
    os.chdir(target)
    return ""


def c_echo(args, stdin):
    if args and args[0] == "-n":
        return " ".join(args[1:])
    return " ".join(args) + "\n"


def c_ls(args, stdin):
    f, v, paths = opts(args)
    paths = paths or ["."]

    def show(path, name):
        st = os.stat(path)
        isdir = statmod.S_ISDIR(st.st_mode)
        label = name + ("/" if isdir else "")
        if "l" not in f:
            return label
        size = human(st.st_size) if "h" in f else str(st.st_size)
        when = time.strftime("%b %d %H:%M", time.localtime(st.st_mtime))
        return f"{'d' if isdir else '-'} {size:>8} {when} {label}"

    out = []
    for p in paths:
        if not os.path.exists(p):
            raise Fail(f"{p}: No such file or directory")
        if os.path.isdir(p):
            if len(paths) > 1:
                out.append(f"{p}:")
            names = sorted(os.listdir(p), key=str.lower)
            if "a" not in f:
                names = [n for n in names if not n.startswith(".")]
            out += [show(os.path.join(p, n), n) for n in names]
        else:
            out.append(show(p, p))
    return join(out)


def c_cat(args, stdin):
    f, v, paths = opts(args)
    text = "".join(t for _, t in inputs(paths, stdin, "cat"))
    if "n" in f:
        return join([f"{i:>6}  {line}" for i, line in enumerate(lines_of(text), 1)])
    return text


def count_arg(v, default=10):
    try:
        return int(v.get("n", default))
    except ValueError:
        raise Fail("the line count must be a number")


def c_head(args, stdin):
    f, v, paths = opts(args, "n")
    n = count_arg(v)
    docs = inputs(paths, stdin, "head")
    out = []
    for name, text in docs:
        if len(docs) > 1:
            out.append(f"==> {name} <==")
        out += lines_of(text)[:n]
    return join(out)


def c_tail(args, stdin):
    f, v, paths = opts(args, "n")
    n = count_arg(v)
    docs = inputs(paths, stdin, "tail")
    out = []
    for name, text in docs:
        if len(docs) > 1:
            out.append(f"==> {name} <==")
        out += lines_of(text)[-n:] if n else []
    return join(out)


def c_wc(args, stdin):
    f, v, paths = opts(args)
    out = []
    for name, text in inputs(paths, stdin, "wc"):
        counts = {"l": text.count("\n"), "w": len(text.split()), "c": len(text.encode())}
        keys = [k for k in "lwc" if k in f] or list("lwc")
        out.append(" ".join(str(counts[k]) for k in keys) + ("" if name == "-" else f" {name}"))
    return join(out)


def walk_files(path):
    if os.path.isfile(path):
        yield path
        return
    for root, dirs, files in os.walk(path):
        dirs.sort()
        for name in sorted(files):
            yield os.path.join(root, name)


def c_grep(args, stdin):
    f, v, rest = opts(args, "e")
    pattern = v.get("e") or (rest.pop(0) if rest else None)
    if pattern is None:
        raise Fail("usage: grep [-inrvcl] pattern [file ...]")
    flags = re.IGNORECASE if "i" in f else 0
    if "F" in f:
        pattern = re.escape(pattern)
    if "w" in f:
        pattern = rf"\b(?:{pattern})\b"
    try:
        rx = re.compile(pattern, flags)
    except re.error as e:
        raise Fail(f"bad pattern: {e}")
    if "r" in f or "R" in f:
        files = [p for path in (rest or ["."]) for p in walk_files(path)]
        named = True
    elif rest:
        files, named = rest, len(rest) > 1
    else:
        files, named = [None], False
    out, matched = [], False
    for path in files:
        try:
            text = stdin or "" if path is None else read_text(path)
        except Fail as e:
            if "r" in f:
                continue
            raise
        hits = [(i, line) for i, line in enumerate(lines_of(text), 1) if bool(rx.search(line)) != ("v" in f)]
        matched = matched or bool(hits)
        prefix = f"{path}:" if named else ""
        if "l" in f:
            if hits:
                out.append(path or "(stdin)")
        elif "c" in f:
            out.append(f"{prefix}{len(hits)}")
        else:
            out += [f"{prefix}{str(i) + ':' if 'n' in f else ''}{line}" for i, line in hits]
    if not matched and not ("c" in f):
        raise Fail("")
    return join(out)


def c_find(args, stdin):
    paths, tests, i = [], {}, 0
    while i < len(args):
        a = args[i]
        if a.startswith("-"):
            if i + 1 >= len(args):
                raise Fail(f"{a} needs a value")
            tests[a] = args[i + 1]
            i += 2
        else:
            paths.append(a)
            i += 1
    out = []
    depth_limit = int(tests["-maxdepth"]) if "-maxdepth" in tests else None
    for top in paths or ["."]:
        if not os.path.exists(top):
            raise Fail(f"{top}: No such file or directory")
        base = top.rstrip("/").count("/")
        for root, dirs, files in os.walk(top):
            dirs.sort()
            depth = root.rstrip("/").count("/") - base
            if depth_limit is not None and depth >= depth_limit:
                dirs[:] = []
            entries = [(os.path.join(root, d), d, "d") for d in dirs] + [(os.path.join(root, n), n, "f") for n in sorted(files)]
            if root == top:
                entries.insert(0, (root, os.path.basename(root) or root, "d"))
            for path, name, kind in entries:
                if depth_limit is not None and path != top and path.rstrip("/").count("/") - base > depth_limit:
                    continue
                if "-type" in tests and tests["-type"] != kind:
                    continue
                if "-name" in tests and not fnmatch.fnmatchcase(name, tests["-name"]):
                    continue
                if "-iname" in tests and not fnmatch.fnmatchcase(name.lower(), tests["-iname"].lower()):
                    continue
                out.append(path)
    return join(out)


def c_mkdir(args, stdin):
    f, v, paths = opts(args)
    for p in paths:
        try:
            os.makedirs(p, exist_ok=("p" in f))
        except FileExistsError:
            raise Fail(f"{p}: File exists")
    return ""


def c_rm(args, stdin):
    f, v, paths = opts(args)
    for p in paths:
        if not os.path.lexists(p):
            if "f" in f:
                continue
            raise Fail(f"{p}: No such file or directory")
        if os.path.isdir(p) and not os.path.islink(p):
            if not ({"r", "R"} & f):
                raise Fail(f"{p}: is a directory (use -r)")
            shutil.rmtree(p)
        else:
            os.remove(p)
    return ""


def destination(sources, target):
    if len(sources) > 1 and not os.path.isdir(target):
        raise Fail(f"{target}: not a directory")
    for s in sources:
        if not os.path.exists(s):
            raise Fail(f"{s}: No such file or directory")
        yield s, (os.path.join(target, os.path.basename(s.rstrip("/"))) if os.path.isdir(target) else target)


def c_cp(args, stdin):
    f, v, paths = opts(args)
    if len(paths) < 2:
        raise Fail("usage: cp [-r] source ... target")
    for s, d in destination(paths[:-1], paths[-1]):
        if os.path.isdir(s):
            if not ({"r", "R"} & f):
                raise Fail(f"{s}: is a directory (use -r)")
            shutil.copytree(s, d, dirs_exist_ok=True)
        else:
            shutil.copy(s, d)
    return ""


def c_mv(args, stdin):
    f, v, paths = opts(args)
    if len(paths) < 2:
        raise Fail("usage: mv source ... target")
    for s, d in destination(paths[:-1], paths[-1]):
        shutil.move(s, d)
    return ""


def c_touch(args, stdin):
    for p in args:
        with open(p, "ab"):
            os.utime(p, None)
    return ""


def c_sort(args, stdin):
    f, v, paths = opts(args)
    lines = [line for _, t in inputs(paths, stdin, "sort") for line in lines_of(t)]

    def key(line):
        if "n" not in f:
            return (0, 0, line)
        m = re.match(r"\s*(-?\d+(?:\.\d+)?)", line)
        return (0, float(m.group(1)), line) if m else (0, 0.0, line)

    lines.sort(key=key, reverse="r" in f)
    if "u" in f:
        seen, unique = set(), []
        for line in lines:
            if line not in seen:
                seen.add(line)
                unique.append(line)
        lines = unique
    return join(lines)


def c_uniq(args, stdin):
    f, v, paths = opts(args)
    out, last, count = [], None, 0
    lines = [line for _, t in inputs(paths, stdin, "uniq") for line in lines_of(t)]
    for line in lines + [None]:
        if line == last:
            count += 1
            continue
        if last is not None:
            out.append(f"{count:>6} {last}" if "c" in f else last)
        last, count = line, 1
    return join(out)


def c_stat(args, stdin):
    out = []
    for p in args:
        if not os.path.exists(p):
            raise Fail(f"{p}: No such file or directory")
        st = os.stat(p)
        kind = "directory" if os.path.isdir(p) else "file"
        out.append(f"{p}: {kind}, {st.st_size} bytes, modified {time.strftime('%Y-%m-%d %H:%M', time.localtime(st.st_mtime))}")
    return join(out)


def c_du(args, stdin):
    f, v, paths = opts(args)
    out = []
    for p in paths or ["."]:
        total = sum(os.path.getsize(x) for x in walk_files(p)) if os.path.exists(p) else 0
        out.append(f"{human(total) if 'h' in f else total}\t{p}")
    return join(out)


def c_tree(args, stdin):
    f, v, paths = opts(args, "L")
    limit = int(v.get("L", 3))
    out = []

    def go(path, prefix, depth):
        if depth > limit:
            return
        names = sorted(os.listdir(path), key=str.lower)
        for k, n in enumerate(names):
            last = k == len(names) - 1
            full = os.path.join(path, n)
            out.append(f"{prefix}{'└── ' if last else '├── '}{n}{'/' if os.path.isdir(full) else ''}")
            if os.path.isdir(full):
                go(full, prefix + ("    " if last else "│   "), depth + 1)

    root = (paths or ["."])[0]
    if not os.path.isdir(root):
        raise Fail(f"{root}: No such directory")
    out.append(root)
    go(root, "", 1)
    return join(out)


MAGIC = [(b"%PDF-", "PDF document"), (b"PK\x03\x04", "Zip archive (also .docx, .xlsx, .pptx)"), (b"\x89PNG", "PNG image"), (b"\xff\xd8\xff", "JPEG image"), (b"GIF8", "GIF image"), (b"SQLite format 3", "SQLite database"), (b"\x1f\x8b", "gzip data")]


def c_file(args, stdin):
    out = []
    for p in args:
        if os.path.isdir(p):
            out.append(f"{p}: directory")
            continue
        if not os.path.exists(p):
            raise Fail(f"{p}: No such file or directory")
        with open(p, "rb") as fh:
            head = fh.read(2048)
        kind = next((label for sig, label in MAGIC if head.startswith(sig)), None)
        if kind is None:
            try:
                head.decode("utf-8")
                kind = "text"
            except UnicodeDecodeError:
                kind = "binary data"
        out.append(f"{p}: {kind}")
    return join(out)


def c_unzip(args, stdin):
    f, v, paths = opts(args, "d")
    if not paths:
        raise Fail("usage: unzip [-l] [-d folder] file.zip")
    try:
        with zipfile.ZipFile(paths[0]) as z:
            if "l" in f:
                return join([f"{i.file_size:>10}  {i.filename}" for i in z.infolist()])
            target = v.get("d", os.path.splitext(os.path.basename(paths[0]))[0])
            z.extractall(target)
            return f"Extracted {len(z.namelist())} files into {target}/\n"
    except zipfile.BadZipFile:
        raise Fail(f"{paths[0]}: not a zip file")


async def ensure_pypdf():
    try:
        import pypdf  # noqa
    except ImportError:
        import micropip
        await micropip.install("pypdf==6.19.0")


def page_range(spec_first, spec_last, total):
    first = max(1, int(spec_first)) if spec_first else 1
    last = min(int(spec_last), total) if spec_last else total
    return first, last


async def open_pdf(path):
    await ensure_pypdf()
    from pypdf import PdfReader
    if not os.path.exists(path):
        raise Fail(f"{path}: No such file or directory")
    try:
        reader = PdfReader(path)
        if reader.is_encrypted:
            try:
                reader.decrypt("")
            except Exception:
                raise Fail(f"{path}: protected by a password")
        len(reader.pages)
    except Fail:
        raise
    except Exception:
        raise Fail(f"{path}: not a readable PDF")
    return reader


async def c_pdftotext(args, stdin):
    f, v, paths = opts(args, "fl")
    if not paths:
        raise Fail("usage: pdftotext [-f first] [-l last] file.pdf [out.txt]")
    try:
        first, last = page_range(v.get("f"), v.get("l"), 10**9)
    except ValueError:
        raise Fail("-f and -l must be page numbers")
    reader = await open_pdf(paths[0])
    total = len(reader.pages)
    first, last = first, min(last, total)
    parts = []
    for n in range(first, last + 1):
        text = (reader.pages[n - 1].extract_text() or "").replace("\x00", "").strip()
        parts.append(f"--- Page {n} ---\n{text or '(no text on this page; it may be a scanned picture)'}")
    text = "\n\n".join(parts) + "\n"
    if len(paths) > 1:
        with open(paths[1], "w", encoding="utf-8") as fh:
            fh.write(text)
        return f"Wrote pages {first}-{last} of {total} to {paths[1]} ({len(text)} characters)\n"
    return text


async def c_pdfinfo(args, stdin):
    if not args:
        raise Fail("usage: pdfinfo file.pdf")
    reader = await open_pdf(args[0])
    meta = reader.metadata
    rows = [("Pages", len(reader.pages))]
    if meta is not None:
        for label, value in (("Title", meta.title), ("Author", meta.author), ("Created", meta.get("/CreationDate"))):
            if value:
                rows.append((label, value))
    return join([f"{k}: {v}" for k, v in rows])


PDF_PAGES_PER_CALL = 10
MIN_PICTURE_SIDE = 64


async def c_pdfimages(args, stdin):
    """Saves the pictures inside PDF pages as JPEG files, so a model can look at them with view_image. A scanned page is one picture."""
    f, v, paths = opts(args, "fls")
    if len(paths) < 2:
        raise Fail("usage: pdfimages [-f first] [-l last] [-s maxpixels] file.pdf prefix  (writes prefix-PAGE-N.jpg, at most 10 pages per call)")
    try:
        first, last = page_range(v.get("f"), v.get("l"), 10**9)
        longest = max(200, min(int(v.get("s", "1400")), 3000))
    except ValueError:
        raise Fail("-f, -l and -s must be numbers")
    reader = await open_pdf(paths[0])
    total = len(reader.pages)
    if first > total:
        raise Fail(f"{paths[0]} has {total} pages")
    last = min(last, total, first + PDF_PAGES_PER_CALL - 1)
    import pyodide_js
    await pyodide_js.loadPackage("pillow")
    folder = os.path.dirname(paths[1])
    if folder:
        os.makedirs(folder, exist_ok=True)
    out = []
    for n in range(first, last + 1):
        saved = 0
        try:
            pictures = list(reader.pages[n - 1].images)
        except Exception:
            pictures = []
        for picture in pictures:
            try:
                img = picture.image.convert("RGB")
            except Exception:
                continue
            if min(img.size) < MIN_PICTURE_SIDE:
                continue
            img.thumbnail((longest, longest))
            saved += 1
            name = f"{paths[1]}-{n}-{saved}.jpg"
            img.save(name, "JPEG", quality=85)
            out.append(f"page {n}: {name} ({img.width}x{img.height})")
        if not saved:
            out.append(f"page {n}: no pictures (text or drawings only: read it with pdftotext)")
    more = f"\n{total - last} more pages: run again with -f {last + 1}" if last < total else ""
    return f"Pictures of pages {first}-{last} of {total}:\n" + join(out) + more + "\nLook at each with view_image.\n"


def check_url(raw):
    url = urlparse(raw.strip())
    if url.scheme != "https" or not url.hostname:
        raise Fail("only https:// links can be downloaded")
    if url.username or url.password:
        raise Fail("links with a login in them cannot be downloaded")
    host = url.hostname.lower()
    private = host == "localhost" or host.endswith((".localhost", ".local", ".internal"))
    try:
        ip = ipaddress.ip_address(host)
        private = private or ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_unspecified
    except ValueError:
        pass
    if private:
        raise Fail("only public web links can be downloaded")
    return url


def file_name_from(url):
    last = unquote(url.path.rstrip("/").split("/")[-1]) if url.path.strip("/") else ""
    return last or "download"


async def fetch(raw):
    url = check_url(raw)
    from pyodide.http import pyfetch
    try:
        resp = await asyncio.wait_for(pyfetch(url.geturl(), credentials="omit", referrerPolicy="no-referrer"), 30)
        if not resp.ok:
            raise Fail(f"the link answered with {resp.status}")
        data = await asyncio.wait_for(resp.bytes(), 60)
    except asyncio.TimeoutError:
        raise Fail("the download took too long")
    except Fail:
        raise
    except Exception:
        raise Fail("the browser blocked this download (the site does not allow other websites to fetch it, a CORS rule). Ask the user to attach the file to the chat. For the text of a page or PDF, call the scrape tool with this link instead. Do not retry the same link")
    if len(data) > FETCH_LIMIT:
        raise Fail("the file is larger than 30 MB")
    return url, data


async def c_curl(args, stdin):
    f, v, rest = opts(args, "oO")
    if not rest:
        raise Fail("usage: curl [-o file | -O] https://link")
    url, data = await fetch(rest[0])
    target = v.get("o") or (file_name_from(url) if "O" in f else None)
    if target is None:
        try:
            return data.decode("utf-8")
        except UnicodeDecodeError:
            raise Fail("the link is a binary file; save it with -o name or -O")
    with open(target, "wb") as fh:
        fh.write(data)
    return f"Saved {target} ({human(len(data))})\n"


async def c_wget(args, stdin):
    f, v, rest = opts(args, "O")
    if not rest:
        raise Fail("usage: wget [-O file] https://link")
    url, data = await fetch(rest[0])
    target = v.get("O") or file_name_from(url)
    with open(target, "wb") as fh:
        fh.write(data)
    return f"Saved {target} ({human(len(data))})\n"


async def c_pip(args, stdin):
    if len(args) < 2 or args[0] != "install":
        raise Fail("usage: pip install package ...")
    import micropip
    names = [a for a in args[1:] if not a.startswith("-")]
    try:
        await asyncio.wait_for(micropip.install(names), 90)
    except asyncio.TimeoutError:
        raise Fail("the install took too long")
    except Exception as e:
        raise Fail(f"could not install: {e}")
    return f"Installed {', '.join(names)}\n"


def c_latex(args, stdin):
    """A small LaTeX-aware terminal command for the Pyodide runtime.

    Pyodide does not ship a native TeX engine.  Keep the command useful and
    explicit: validate a .tex source and point the agent at the supported
    Python/PyLaTeX workflow instead of pretending that a PDF was compiled.
    """
    if not args or args[0] in ("--help", "-h"):
        return (
            "LaTeX is available as a source workflow in this browser terminal.\n"
            "Usage: latex --check file.tex\n"
            "Generate .tex with Python (or pip install pylatex); a native TeX/PDF compiler is not bundled in Pyodide.\n"
        )
    check = args[0] in ("--check", "-c")
    path = args[1] if check and len(args) > 1 else (args[0] if not check else None)
    if not path:
        raise Fail("usage: latex --check file.tex")
    text = read_text(path)
    if not path.lower().endswith((".tex", ".latex")):
        raise Fail(f"{path}: expected a .tex or .latex source file")
    # These checks catch the common malformed source cases without claiming
    # to implement TeX parsing.
    if text.count("{") != text.count("}"):
        raise Fail(f"{path}: unmatched braces")
    stack = []
    for match in re.finditer(r"\\(begin|end)\s*\{([^}]+)\}", text):
        kind, environment = match.groups()
        if kind == "begin":
            stack.append(environment)
        elif not stack or stack.pop() != environment:
            raise Fail(f"{path}: \\begin/\\end environments do not match")
    if stack:
        raise Fail(f"{path}: \\begin/\\end environments do not match")
    return f"{path}: LaTeX source looks balanced ({len(text)} characters). Use a TeX engine outside Pyodide to compile it.\n"


async def run_code(code, namespace):
    """Runs Python, returns (what it printed plus the value of a last expression, exit code). Errors come back as text."""
    out = io.StringIO()
    status = 0
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
        try:
            import pyodide_js
            from pyodide.code import eval_code_async
            await pyodide_js.loadPackagesFromImports(code)
            value = await eval_code_async(code, globals=namespace, filename="<code>")
            if value is not None:
                print(repr(value))
        except SystemExit as e:
            status = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
            if isinstance(e.code, str):
                print(e.code)
        except BaseException as e:
            status = 1
            frames = [fr for fr in traceback.extract_tb(e.__traceback__) if fr.filename == "<code>"]
            print("".join(traceback.format_list(frames) + traceback.format_exception_only(type(e), e)), end="")
            if isinstance(e, ModuleNotFoundError):
                print("If it is a pure-Python package, install it with: pip install <name>")
    return out.getvalue(), status


async def c_python(args, stdin):
    f, v, rest = opts(args, "c")
    if "c" in v:
        code, argv = v["c"], ["-c"] + rest
    elif rest:
        code, argv = read_text(rest[0]), rest
    elif stdin:
        code, argv = stdin, ["-"]
    else:
        raise Fail("usage: python script.py [args]  or  python -c \"code\"")
    sys.argv = argv
    script_dir = os.path.dirname(os.path.abspath(rest[0])) if "c" not in v and rest else HOME
    for folder in (script_dir, os.getcwd()):  # scripts can import helper modules saved next to them
        if folder not in sys.path:
            sys.path.insert(0, folder)
    text, status = await run_code(code, {"__name__": "__main__"})
    if status:
        raise Fail(text.rstrip("\n") or f"exited with {status}")
    return text


def c_help(args, stdin):
    return join(f"{name}" for name in sorted(COMMANDS))


COMMANDS = {
    "pwd": c_pwd, "cd": c_cd, "echo": c_echo, "ls": c_ls, "cat": c_cat, "head": c_head, "tail": c_tail, "wc": c_wc,
    "grep": c_grep, "find": c_find, "mkdir": c_mkdir, "rm": c_rm, "cp": c_cp, "mv": c_mv, "touch": c_touch,
    "sort": c_sort, "uniq": c_uniq, "stat": c_stat, "du": c_du, "tree": c_tree, "file": c_file, "unzip": c_unzip,
    "pdftotext": c_pdftotext, "pdfinfo": c_pdfinfo, "pdfimages": c_pdfimages, "curl": c_curl, "wget": c_wget, "pip": c_pip, "pip3": c_pip,
    "python": c_python, "python3": c_python, "latex": c_latex, "tex": c_latex, "help": c_help,
}


def tokenize(line):
    lex = shlex.shlex(line, posix=True, punctuation_chars=True)
    lex.whitespace_split = True
    lex.commenters = ""
    try:
        return list(lex)
    except ValueError as e:
        raise Fail(f"cannot parse the command: {e}")


def expand(words):
    out = []
    for w in words:
        if re.search(r"[*?\[]", w):
            hits = sorted(glob.glob(w))
            out += hits or [w]
        else:
            out.append(w)
    return out


def split_on(tokens, separators):
    groups, current = [], []
    for t in tokens:
        if t in separators:
            groups.append((current, t))
            current = []
        else:
            current.append(t)
    groups.append((current, None))
    return groups


async def run_simple(words, stdin, errors):
    """One command with its redirects. Returns (stdout, exit code)."""
    args, out_file, append, in_file, drop_errors = [], None, False, None, False
    i = 0
    while i < len(words):
        w = words[i]
        if w in (">", ">>", "<", ">&"):
            if i + 1 >= len(words):
                raise Fail(f"nothing after {w}")
            target = words[i + 1]
            i += 2
            fd2 = bool(args) and args[-1] == "2"
            if fd2:
                args.pop()
            if w == ">&":
                continue  # 2>&1: errors already share the output
            if fd2:
                drop_errors = drop_errors or target == "/dev/null"
            elif w == "<":
                in_file = target
            elif target != "/dev/null":
                out_file, append = target, w == ">>"
            else:
                out_file = os.devnull
            continue
        args.append(w)
        i += 1
    if not args:
        return "", 0
    name, args = args[0], expand(args[1:])
    fn = COMMANDS.get(name)
    if fn is None:
        errors.append(f"{name}: command not found. Run `help` for the commands that exist.")
        return "", 127
    if in_file is not None:
        stdin = read_text(in_file)
    try:
        result = fn(args, stdin)
        if inspect.isawaitable(result):
            result = await result
        text, code = result or "", 0
    except Fail as e:
        if str(e) and not drop_errors:
            errors.append(f"{name}: {e}")
        text, code = "", 1
    except Exception as e:
        if not drop_errors:
            errors.append(f"{name}: {type(e).__name__}: {e}")
        text, code = "", 1
    if out_file is not None:
        if out_file != os.devnull:
            with open(out_file, "a" if append else "w", encoding="utf-8") as fh:
                fh.write(text)
        text = ""
    return text, code


async def run_shell(line):
    out, code = [], 0
    try:
        tokens = tokenize(line)
        if "&" in tokens:
            raise Fail("background jobs (&) are not supported")
        previous = None
        for group, op in split_on(tokens, {";", "&&", "||"}):
            if previous == "&&" and code != 0:
                previous = op
                continue
            if previous == "||" and code == 0:
                previous = op
                continue
            errors, data = [], None
            for part, _ in split_on(group, {"|"}):
                data, code = await run_simple(part, data, errors)
            out.append("".join(f"{e}\n" for e in errors) + (data or ""))
            previous = op
    except Fail as e:
        out.append(f"{e}\n")
        code = 2
    return json.dumps({"output": clip("".join(out)), "code": code, "cwd": os.getcwd()})

