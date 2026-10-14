# Files skill: attached files live in the sandbox, not in your context

Files the user attaches that are not pictures, audio or video (PDFs, documents, spreadsheets, CSV, JSON, code, archives, plain text) are never put in front of you. Each one is only a reference: a name, a type and a size, and the file itself is in the Python environment's home folder under that name. This keeps big files out of your context. Pictures, audio and video are the only files you see directly.

## What to do

1. **Check the environment first.** Call `sandbox_status`. If it says booting up, tell the user in one line that the environment is booting up and carry on with anything that needs no file; try again in a few seconds. If it says not available, say that plainly and do not pretend to have read the file. Never guess what a file contains.
2. **Look before you read.** `ls -l`, then `file name`, `pdfinfo name.pdf` for a PDF's page count, `head -n 20 name.csv` for the shape of a table.
3. **See it when text is not enough.** To look at a scanned page or a picture inside a PDF, extract its pictures and view them: `pdfimages -f 3 -l 3 file.pdf page` writes `page-3-1.jpg` (a scanned page is one picture), then call `view_image` on it. View one page at a time and only the pages you need (pictures stay in your context); use `-s 900` for a smaller picture. `pdfimages` cannot draw text or vector charts: it says a page has no pictures, and you read that page with `pdftotext`. If you truly need to see a page that has no picture (a vector chart or a drawn diagram), install a renderer yourself: `pip install pymupdf`, then save a script that does `pymupdf.open("file.pdf")[2].get_pixmap(dpi=70).save("page-3.png")` and view it. It is a big download, so do this only when the text and `pdfimages` cannot answer. Find the right page with `pdftotext | grep -n` first.
4. **Read only what the question needs.** Use `head`, `tail`, `grep -n`, `pdftotext -f 3 -l 5`, or a script that prints a summary. Never print a whole large file: the answer must come from the part you looked at.
5. **Do the work in Python.** For counting, filtering, joins, statistics, conversions or any calculation, save a script with `write_file`, run it with `python script.py` and read what it prints. pandas, numpy and similar load when imported. Fix the script and run it again when it fails.
6. **Say where an answer came from** (a page, a row range, a column) so the user can check it.
7. **Give files back as files.** A chart, a converted file or a generated report is made with a script and handed over with the export tool of this app, never pasted into the chat as text or base64.

## When a file cannot be read

A scanned PDF has no text (`pdftotext` says there is none): extract the pages you need with `pdfimages` and read them with `view_image`. Some formats have no reader here; say so, and ask the user for another version. Do not invent content.
