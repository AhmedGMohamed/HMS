/**
 * Static type declarations for the `@digicole/pdfmake-rtl` UMD bundles.
 *
 * The package ships two browser IIFE scripts:
 *  - `build/pdfmake.js`    — sets `window.pdfMake` as a side-effect
 *  - `build/vfs_fonts.js`  — calls `pdfMake.addVirtualFileSystem(...)`
 *
 * We lazy-import these for side-effects only. Runtime interaction
 * goes through `window.pdfMake`, declared locally with the
 * `PdfMake` interface in `pages/Patients/lib/pdfmake/pdfmakeLoader.ts`.
 */
declare module "@digicole/pdfmake-rtl/build/pdfmake.js"
declare module "@digicole/pdfmake-rtl/build/vfs_fonts.js"
declare module "@digicole/pdfmake-rtl"
