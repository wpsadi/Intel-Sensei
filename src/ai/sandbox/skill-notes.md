## Moving files between the sandbox and notes (note editor only)

- **Into the sandbox:** a note's image or file block has a `src` such as `snote-media:abc123`. Run `import_media` with that src to copy it into the home folder, then work on it with the terminal.
- **Out of the sandbox:** `export_media` saves a sandbox file (a chart, a converted file, a generated document) and returns a `snote-media:…` id. Put it in a note with insert_block as an `image` block (for pictures) or a `file` block (anything else), with attrs `{"src": "<the id>"}`. Read the note first, as for any edit.
- **Text into a note:** do not retype a file's text. Prepare it in the sandbox (for a PDF, `pdftotext -f 2 -l 6 guide.pdf guide.txt`), then call `paste_file` with `reflow: true` for PDF text. Paste a few pages at a time for long documents.
- **Charts:** write the picture with matplotlib (`plt.savefig("chart.png")`), `export_media` it, and insert it as an image block.
