use std::{fs, path::Path};

#[derive(Clone, Copy)]
pub(super) enum EpubFixtureTocMode {
    Nav,
    Ncx,
    SpineFallback,
}

pub(super) fn write_test_epub(path: &Path, title: &str, author: &str, body_text: &str) {
    write_test_epub_with_toc_mode(path, title, author, body_text, EpubFixtureTocMode::Nav);
}

pub(super) fn write_test_epub_with_toc_mode(
    path: &Path,
    title: &str,
    author: &str,
    body_text: &str,
    toc_mode: EpubFixtureTocMode,
) {
    use std::io::Write;
    use zip::{write::FileOptions, CompressionMethod, ZipWriter};

    let file = fs::File::create(path).expect("create epub fixture");
    let mut zip = ZipWriter::new(file);
    let stored = FileOptions::default().compression_method(CompressionMethod::Stored);
    let deflated = FileOptions::default().compression_method(CompressionMethod::Deflated);
    let (toc_manifest, spine_attributes) = match toc_mode {
        EpubFixtureTocMode::Nav => (
            r#"    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>"#,
            "",
        ),
        EpubFixtureTocMode::Ncx => (
            r#"    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>"#,
            r#" toc="ncx""#,
        ),
        EpubFixtureTocMode::SpineFallback => ("", ""),
    };

    zip.start_file("mimetype", stored)
        .expect("start mimetype file");
    zip.write_all(b"application/epub+zip")
        .expect("write mimetype");

    zip.start_file("META-INF/container.xml", deflated)
        .expect("start container.xml");
    zip.write_all(
        br#"<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>"#,
    )
    .expect("write container.xml");

    zip.start_file("OEBPS/content.opf", deflated)
        .expect("start content.opf");
    zip.write_all(
        format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="BookId">urn:test:book</dc:identifier>
<dc:title>{title}</dc:title>
<dc:creator>{author}</dc:creator>
  </metadata>
  <manifest>
<item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>
{toc_manifest}
<item id="style" href="styles/book.css" media-type="text/css"/>
<item id="cover" href="images/cover.png" media-type="image/png"/>
  </manifest>
  <spine{spine_attributes}>
<itemref idref="chapter"/>
  </spine>
</package>"#
        )
        .as_bytes(),
    )
    .expect("write content.opf");

    zip.start_file("OEBPS/styles/book.css", deflated)
        .expect("start css");
    zip.write_all(b".chapter{color:#202020}.cover{background-image:url('../images/cover.png')}")
        .expect("write css");

    if matches!(toc_mode, EpubFixtureTocMode::Nav) {
        zip.start_file("OEBPS/nav.xhtml", deflated)
            .expect("start nav.xhtml");
        zip.write_all(
            format!(
                r#"<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>Contents</title></head>
  <body>
<nav epub:type="toc">
  <ol>
    <li>
      <a href="chapter.xhtml#intro">{title}</a>
      <ol>
        <li><a href="chapter.xhtml#details">Details</a></li>
      </ol>
    </li>
  </ol>
</nav>
  </body>
</html>"#
            )
            .as_bytes(),
        )
        .expect("write nav.xhtml");
    }

    if matches!(toc_mode, EpubFixtureTocMode::Ncx) {
        zip.start_file("OEBPS/toc.ncx", deflated)
            .expect("start toc.ncx");
        zip.write_all(
            format!(
                r#"<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
<navPoint id="intro" playOrder="1">
  <navLabel><text>{title}</text></navLabel>
  <content src="chapter.xhtml#intro"/>
  <navPoint id="details" playOrder="2">
    <navLabel><text>Details</text></navLabel>
    <content src="chapter.xhtml#details"/>
  </navPoint>
</navPoint>
  </navMap>
</ncx>"#
            )
            .as_bytes(),
        )
        .expect("write toc.ncx");
    }

    zip.start_file("OEBPS/chapter.xhtml", deflated)
        .expect("start chapter.xhtml");
    zip.write_all(
        format!(
            r##"<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
<title>{title}</title>
<link rel="stylesheet" href="styles/book.css" type="text/css"/>
  </head>
  <body>
<section class="chapter">
  <h1 id="intro">{title}</h1>
  <p>{body_text}</p>
  <h2 id="details">Details</h2>
  <p><a href="#details">Jump</a></p>
  <img class="cover" src="images/cover.png" alt="cover"/>
</section>
  </body>
</html>"##
        )
        .as_bytes(),
    )
    .expect("write chapter.xhtml");

    zip.start_file("OEBPS/images/cover.png", deflated)
        .expect("start cover image");
    zip.write_all(&[
        137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6,
        0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 255, 255, 63, 0,
        5, 254, 2, 254, 167, 53, 129, 132, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
    ])
    .expect("write cover image");

    zip.finish().expect("finish epub fixture");
}
