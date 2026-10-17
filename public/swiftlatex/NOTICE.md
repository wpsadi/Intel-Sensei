# SwiftLaTeX assets

The `swiftlatexpdftex.js` and `swiftlatexpdftex.wasm` files are the PDFTeX
browser engine from [SwiftLaTeX](https://github.com/SwiftLaTeX/SwiftLaTeX),
release `v20022022`. SwiftLaTeX is available under the Eclipse Public License
2.0 or the GNU General Public License 2.0 with the Classpath Exception
(`EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0`).

The assets are loaded on demand by the sandbox's nested worker. TeX package
files are fetched by SwiftLaTeX from its configured TeX Live endpoint.
