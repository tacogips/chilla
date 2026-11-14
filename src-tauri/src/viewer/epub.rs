use std::{
    borrow::Cow,
    collections::{BTreeSet, HashMap},
    fs::File,
    io::{Read, Seek},
    path::Path,
    time::Instant,
};

use base64::Engine;
use roxmltree::{Document, Node, NodeType};
use zip::{read::ZipFile, result::ZipError, ZipArchive};

use crate::viewer::types::EpubNavigationItem;
use crate::{
    error::{AppError, AppResult},
    verbose_log::{self, VerboseIoOutcome},
};

#[derive(Debug)]
pub struct RenderedEpub {
    pub html: String,
    pub toc: Vec<EpubNavigationItem>,
}

#[derive(Debug, Clone)]
struct ManifestItem {
    media_type: String,
}

#[derive(Debug)]
struct EpubPackage {
    title: Option<String>,
    author: Option<String>,
    manifest_by_path: HashMap<String, ManifestItem>,
    spine_paths: Vec<String>,
    navigation_document_path: Option<String>,
    toc_ncx_path: Option<String>,
}

#[derive(Debug)]
struct RenderedChapter {
    path: String,
    title: Option<String>,
    body_html: String,
}

struct RenderContext<'a> {
    chapter_path: &'a str,
    package: &'a EpubPackage,
}

pub fn render_epub(path: &Path) -> AppResult<RenderedEpub> {
    let file = observed_open_epub(path).map_err(|source| AppError::io("open", path, source))?;
    let mut archive = observed_open_zip_archive(file, path).map_err(|source| {
        AppError::epub_parse(path, format!("failed to open zip archive: {source}"))
    })?;

    let container_xml = read_zip_string(&mut archive, "META-INF/container.xml", path)?;
    let package_path = parse_container_rootfile_path(&container_xml, path)?;
    let package_xml = read_zip_string(&mut archive, &package_path, path)?;
    let package = parse_package_document(&package_xml, &package_path, path)?;

    let mut stylesheet_paths = BTreeSet::new();
    let mut chapters = Vec::new();

    for spine_path in &package.spine_paths {
        let chapter_xml = read_zip_string(&mut archive, spine_path, path)?;
        let sanitized_chapter_xml = strip_xml_doctype(&chapter_xml);
        let chapter_document =
            Document::parse(sanitized_chapter_xml.as_ref()).map_err(|source| {
                AppError::epub_parse(
                    path,
                    format!("failed to parse chapter `{spine_path}`: {source}"),
                )
            })?;
        collect_head_stylesheet_paths(&chapter_document, spine_path, &mut stylesheet_paths);
        let rendered_body = render_chapter_body(
            &chapter_document,
            &mut archive,
            path,
            &RenderContext {
                chapter_path: spine_path,
                package: &package,
            },
        )?;
        chapters.push(RenderedChapter {
            path: spine_path.clone(),
            title: chapter_title(&chapter_document, spine_path),
            body_html: rendered_body,
        });
    }
    let toc = parse_navigation_items(&mut archive, path, &package, &chapters)?;

    let mut html = String::new();
    html.push_str("<section class=\"file-preview file-preview--epub\">");
    html.push_str("<article class=\"epub-preview\">");
    if let Some(style_block) =
        render_stylesheet_block(&mut archive, path, &package, &stylesheet_paths)?
    {
        html.push_str(&style_block);
    }
    html.push_str("<header class=\"epub-preview__meta\">");
    if let Some(title) = package.title.as_deref() {
        html.push_str("<h1 class=\"epub-preview__title\">");
        html.push_str(&escape_html_text(title));
        html.push_str("</h1>");
    }
    if let Some(author) = package.author.as_deref() {
        html.push_str("<p class=\"epub-preview__author\">");
        html.push_str(&escape_html_text(author));
        html.push_str("</p>");
    }
    html.push_str("</header>");

    for chapter in &chapters {
        html.push_str("<section class=\"epub-preview__chapter\" id=\"");
        html.push_str(&chapter_section_id(&chapter.path));
        html.push_str("\" data-epub-path=\"");
        html.push_str(&escape_html_attribute(&chapter.path));
        html.push_str("\" data-epub-href=\"");
        html.push_str(&escape_html_attribute(&chapter.path));
        html.push_str("\">");
        html.push_str(&chapter.body_html);
        html.push_str("</section>");
    }

    html.push_str("</article></section>");

    Ok(RenderedEpub { html, toc })
}

fn observed_open_epub(path: &Path) -> std::io::Result<File> {
    if !verbose_log::is_enabled() {
        return File::open(path);
    }

    let started_at = Instant::now();
    let result = File::open(path);
    match &result {
        Ok(_) => verbose_log::record_io(
            "open_epub_archive",
            path,
            started_at,
            VerboseIoOutcome::Success { size_bytes: None },
        ),
        Err(error) => verbose_log::record_io(
            "open_epub_archive",
            path,
            started_at,
            VerboseIoOutcome::Failure { error },
        ),
    }
    result
}

fn observed_open_zip_archive<R: Read + Seek>(
    reader: R,
    epub_path: &Path,
) -> Result<ZipArchive<R>, ZipError> {
    if !verbose_log::is_enabled() {
        return ZipArchive::new(reader);
    }

    let started_at = Instant::now();
    let result = ZipArchive::new(reader);
    match &result {
        Ok(_) => verbose_log::record_io(
            "open_epub_zip_archive",
            epub_path,
            started_at,
            VerboseIoOutcome::Success { size_bytes: None },
        ),
        Err(ZipError::Io(error)) => verbose_log::record_io(
            "open_epub_zip_archive",
            epub_path,
            started_at,
            VerboseIoOutcome::Failure { error },
        ),
        Err(
            ZipError::InvalidArchive(_) | ZipError::UnsupportedArchive(_) | ZipError::FileNotFound,
        ) => {}
    }
    result
}

fn observed_lookup_epub_entry<'a, R: Read + Seek>(
    archive: &'a mut ZipArchive<R>,
    entry_path: &str,
    epub_path: &Path,
) -> Result<ZipFile<'a>, ZipError> {
    if !verbose_log::is_enabled() {
        return archive.by_name(entry_path);
    }

    let started_at = Instant::now();
    let result = archive.by_name(entry_path);
    match &result {
        Ok(entry) => verbose_log::record_io(
            "lookup_epub_archive_entry",
            epub_path,
            started_at,
            VerboseIoOutcome::Success {
                size_bytes: Some(entry.size()),
            },
        ),
        Err(ZipError::Io(error)) => verbose_log::record_io(
            "lookup_epub_archive_entry",
            epub_path,
            started_at,
            VerboseIoOutcome::Failure { error },
        ),
        Err(
            ZipError::InvalidArchive(_) | ZipError::UnsupportedArchive(_) | ZipError::FileNotFound,
        ) => {}
    }
    result
}

fn observed_read_epub_entry(entry: &mut impl Read, epub_path: &Path) -> std::io::Result<Vec<u8>> {
    if !verbose_log::is_enabled() {
        let mut bytes = Vec::new();
        entry.read_to_end(&mut bytes)?;
        return Ok(bytes);
    }

    let started_at = Instant::now();
    let mut bytes = Vec::new();
    let result = entry.read_to_end(&mut bytes);
    match &result {
        Ok(_) => verbose_log::record_io(
            "read_epub_archive_entry",
            epub_path,
            started_at,
            VerboseIoOutcome::Success {
                size_bytes: Some(bytes.len() as u64),
            },
        ),
        Err(error) => verbose_log::record_io(
            "read_epub_archive_entry",
            epub_path,
            started_at,
            VerboseIoOutcome::Failure { error },
        ),
    }
    result.map(|_| bytes)
}

fn read_zip_string(
    archive: &mut ZipArchive<File>,
    entry_path: &str,
    epub_path: &Path,
) -> AppResult<String> {
    Ok(String::from_utf8_lossy(&read_zip_bytes(archive, entry_path, epub_path)?).into_owned())
}

fn try_read_zip_string(
    archive: &mut ZipArchive<File>,
    entry_path: &str,
    epub_path: &Path,
) -> AppResult<Option<String>> {
    try_read_zip_bytes(archive, entry_path, epub_path)
        .map(|bytes| bytes.map(|bytes| String::from_utf8_lossy(&bytes).into_owned()))
}

fn read_zip_bytes(
    archive: &mut ZipArchive<File>,
    entry_path: &str,
    epub_path: &Path,
) -> AppResult<Vec<u8>> {
    let mut entry =
        observed_lookup_epub_entry(archive, entry_path, epub_path).map_err(|source| {
            AppError::epub_parse(
                epub_path,
                format!("missing archive entry `{entry_path}`: {source}"),
            )
        })?;
    observed_read_epub_entry(&mut entry, epub_path).map_err(|source| {
        AppError::epub_parse(
            epub_path,
            format!("failed to read archive entry `{entry_path}`: {source}"),
        )
    })
}

fn try_read_zip_bytes(
    archive: &mut ZipArchive<File>,
    entry_path: &str,
    epub_path: &Path,
) -> AppResult<Option<Vec<u8>>> {
    let mut entry = match observed_lookup_epub_entry(archive, entry_path, epub_path) {
        Ok(entry) => entry,
        Err(ZipError::FileNotFound) => return Ok(None),
        Err(source) => {
            return Err(AppError::epub_parse(
                epub_path,
                format!("failed to access archive entry `{entry_path}`: {source}"),
            ))
        }
    };

    observed_read_epub_entry(&mut entry, epub_path)
        .map(Some)
        .map_err(|source| {
            AppError::epub_parse(
                epub_path,
                format!("failed to read archive entry `{entry_path}`: {source}"),
            )
        })
}

fn parse_container_rootfile_path(container_xml: &str, epub_path: &Path) -> AppResult<String> {
    let sanitized_container_xml = strip_xml_doctype(container_xml);
    let document = Document::parse(sanitized_container_xml.as_ref()).map_err(|source| {
        AppError::epub_parse(
            epub_path,
            format!("failed to parse container.xml: {source}"),
        )
    })?;

    document
        .descendants()
        .find(|node| node.is_element() && node.tag_name().name() == "rootfile")
        .and_then(|node| node.attribute("full-path"))
        .map(normalize_archive_path)
        .filter(|path| !path.is_empty())
        .ok_or_else(|| AppError::epub_parse(epub_path, "container.xml is missing rootfile"))
}

fn parse_package_document(
    package_xml: &str,
    package_path: &str,
    epub_path: &Path,
) -> AppResult<EpubPackage> {
    let sanitized_package_xml = strip_xml_doctype(package_xml);
    let document = Document::parse(sanitized_package_xml.as_ref()).map_err(|source| {
        AppError::epub_parse(
            epub_path,
            format!("failed to parse package document `{package_path}`: {source}"),
        )
    })?;
    let package_directory = package_path
        .rsplit_once('/')
        .map(|(directory, _)| directory)
        .unwrap_or("");

    let title = first_descendant_text(&document, "title");
    let author = first_descendant_text(&document, "creator");

    let mut manifest_href_by_id = HashMap::new();
    let mut manifest_by_path = HashMap::new();
    let mut navigation_document_path = None;
    let mut toc_ncx_path = None;
    for item in document
        .descendants()
        .filter(|node| node.is_element() && node.tag_name().name() == "item")
    {
        let Some(id) = item.attribute("id") else {
            continue;
        };
        let Some(href) = item.attribute("href") else {
            continue;
        };
        let Some(media_type) = item.attribute("media-type") else {
            continue;
        };
        let properties = item
            .attribute("properties")
            .unwrap_or_default()
            .split_ascii_whitespace()
            .map(str::to_string)
            .collect::<Vec<_>>();

        let full_path = resolve_archive_path_from_directory(package_directory, href);
        if properties.iter().any(|property| property == "nav") {
            navigation_document_path = Some(full_path.clone());
        }
        if media_type == "application/x-dtbncx+xml" {
            toc_ncx_path = Some(full_path.clone());
        }
        manifest_href_by_id.insert(id.to_string(), full_path.clone());
        manifest_by_path.insert(
            full_path,
            ManifestItem {
                media_type: media_type.to_string(),
            },
        );
    }

    let spine_toc_id = document
        .descendants()
        .find(|node| node.is_element() && node.tag_name().name() == "spine")
        .and_then(|node| node.attribute("toc"));
    if toc_ncx_path.is_none() {
        toc_ncx_path = spine_toc_id.and_then(|id| manifest_href_by_id.get(id).cloned());
    }

    let spine_paths = document
        .descendants()
        .filter(|node| node.is_element() && node.tag_name().name() == "itemref")
        .filter_map(|itemref| itemref.attribute("idref"))
        .filter_map(|idref| manifest_href_by_id.get(idref).cloned())
        .collect::<Vec<_>>();

    if spine_paths.is_empty() {
        return Err(AppError::epub_parse(
            epub_path,
            "package document does not declare any spine documents",
        ));
    }

    Ok(EpubPackage {
        title,
        author,
        manifest_by_path,
        spine_paths,
        navigation_document_path,
        toc_ncx_path,
    })
}

fn first_descendant_text(document: &Document<'_>, tag_name: &str) -> Option<String> {
    document
        .descendants()
        .find(|node| node.is_element() && node.tag_name().name() == tag_name)
        .and_then(|node| node.text())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn chapter_title(document: &Document<'_>, chapter_path: &str) -> Option<String> {
    first_descendant_matching_text(document, |node| {
        node.is_element() && matches!(node.tag_name().name(), "h1" | "h2" | "h3")
    })
    .or_else(|| first_descendant_text(document, "title"))
    .or_else(|| {
        Path::new(chapter_path)
            .file_stem()
            .and_then(|value| value.to_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
    })
}

fn first_descendant_matching_text(
    document: &Document<'_>,
    predicate: impl Fn(Node<'_, '_>) -> bool,
) -> Option<String> {
    document
        .descendants()
        .find(|node| predicate(*node))
        .and_then(node_text_content)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn node_text_content(node: Node<'_, '_>) -> Option<String> {
    let text = node
        .descendants()
        .filter(|child| child.node_type() == NodeType::Text)
        .filter_map(|child| child.text())
        .collect::<String>();
    let trimmed = text.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn parse_navigation_items(
    archive: &mut ZipArchive<File>,
    epub_path: &Path,
    package: &EpubPackage,
    chapters: &[RenderedChapter],
) -> AppResult<Vec<EpubNavigationItem>> {
    if let Some(navigation_document_path) = package.navigation_document_path.as_deref() {
        let Some(nav_xml) = try_read_zip_string(archive, navigation_document_path, epub_path)?
        else {
            return Ok(synthesize_spine_navigation(chapters));
        };
        if let Some(toc) =
            parse_navigation_document(&nav_xml, navigation_document_path, package, epub_path)?
        {
            if !toc.is_empty() {
                return Ok(toc);
            }
        }
    }

    if let Some(ncx_path) = package.toc_ncx_path.as_deref() {
        let Some(ncx_xml) = try_read_zip_string(archive, ncx_path, epub_path)? else {
            return Ok(synthesize_spine_navigation(chapters));
        };
        let toc = parse_ncx_document(&ncx_xml, ncx_path, package, epub_path)?;
        if !toc.is_empty() {
            return Ok(toc);
        }
    }

    Ok(synthesize_spine_navigation(chapters))
}

fn parse_navigation_document(
    navigation_xml: &str,
    navigation_path: &str,
    package: &EpubPackage,
    epub_path: &Path,
) -> AppResult<Option<Vec<EpubNavigationItem>>> {
    let sanitized_navigation_xml = strip_xml_doctype(navigation_xml);
    let document = Document::parse(sanitized_navigation_xml.as_ref()).map_err(|source| {
        AppError::epub_parse(
            epub_path,
            format!("failed to parse navigation document `{navigation_path}`: {source}"),
        )
    })?;

    let toc_list = document
        .descendants()
        .find(|node| is_navigation_toc_node(*node))
        .and_then(|node| {
            node.children()
                .find(|child| child.is_element() && matches!(child.tag_name().name(), "ol" | "ul"))
        });

    let Some(toc_list) = toc_list else {
        return Ok(None);
    };

    Ok(Some(parse_navigation_list(
        toc_list,
        navigation_path,
        package,
    )))
}

fn is_navigation_toc_node(node: Node<'_, '_>) -> bool {
    if !(node.is_element() && node.tag_name().name() == "nav") {
        return false;
    }

    node.attributes().any(|attribute| {
        let value = attribute.value().to_ascii_lowercase();
        (attribute.name() == "type" && value.contains("toc"))
            || (attribute.name() == "role" && value.contains("doc-toc"))
    })
}

fn parse_navigation_list(
    list_node: Node<'_, '_>,
    base_path: &str,
    package: &EpubPackage,
) -> Vec<EpubNavigationItem> {
    list_node
        .children()
        .filter(|node| node.is_element() && node.tag_name().name() == "li")
        .map(|node| parse_navigation_list_item(node, base_path, package))
        .collect()
}

fn parse_navigation_list_item(
    list_item: Node<'_, '_>,
    base_path: &str,
    package: &EpubPackage,
) -> EpubNavigationItem {
    let label_node = list_item
        .children()
        .find(|node| node.is_element() && matches!(node.tag_name().name(), "a" | "span"));

    let (href, anchor_id, label) = if let Some(label_node) = label_node {
        let href = label_node
            .attribute("href")
            .and_then(|href| normalized_navigation_target(href, base_path, package))
            .map(|(href, _)| href);
        let anchor_id = label_node
            .attribute("href")
            .and_then(|href| normalized_navigation_target(href, base_path, package))
            .and_then(|(_, anchor_id)| anchor_id);
        let label = node_text_content(label_node).unwrap_or_else(|| "Untitled".to_string());
        (href, anchor_id, label)
    } else {
        (
            None,
            None,
            node_text_content(list_item).unwrap_or_else(|| "Untitled".to_string()),
        )
    };

    let children = list_item
        .children()
        .find(|node| node.is_element() && matches!(node.tag_name().name(), "ol" | "ul"))
        .map(|node| parse_navigation_list(node, base_path, package))
        .unwrap_or_default();

    EpubNavigationItem {
        label,
        href,
        anchor_id,
        children,
    }
}

fn parse_ncx_document(
    ncx_xml: &str,
    ncx_path: &str,
    package: &EpubPackage,
    epub_path: &Path,
) -> AppResult<Vec<EpubNavigationItem>> {
    let sanitized_ncx_xml = strip_xml_doctype(ncx_xml);
    let document = Document::parse(sanitized_ncx_xml.as_ref()).map_err(|source| {
        AppError::epub_parse(
            epub_path,
            format!("failed to parse NCX document `{ncx_path}`: {source}"),
        )
    })?;

    Ok(document
        .descendants()
        .find(|node| node.is_element() && node.tag_name().name() == "navMap")
        .map(|nav_map| {
            nav_map
                .children()
                .filter(|node| node.is_element() && node.tag_name().name() == "navPoint")
                .map(|node| parse_ncx_nav_point(node, ncx_path, package))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default())
}

fn parse_ncx_nav_point(
    nav_point: Node<'_, '_>,
    base_path: &str,
    package: &EpubPackage,
) -> EpubNavigationItem {
    let href = nav_point
        .children()
        .find(|node| node.is_element() && node.tag_name().name() == "content")
        .and_then(|node| node.attribute("src"))
        .and_then(|src| normalized_navigation_target(src, base_path, package));
    let label = nav_point
        .descendants()
        .find(|node| node.is_element() && node.tag_name().name() == "text")
        .and_then(node_text_content)
        .unwrap_or_else(|| "Untitled".to_string());
    let children = nav_point
        .children()
        .filter(|node| node.is_element() && node.tag_name().name() == "navPoint")
        .map(|node| parse_ncx_nav_point(node, base_path, package))
        .collect::<Vec<_>>();

    EpubNavigationItem {
        label,
        href: href.as_ref().map(|(href, _)| href.clone()),
        anchor_id: href.and_then(|(_, anchor_id)| anchor_id),
        children,
    }
}

fn synthesize_spine_navigation(chapters: &[RenderedChapter]) -> Vec<EpubNavigationItem> {
    chapters
        .iter()
        .map(|chapter| EpubNavigationItem {
            label: chapter
                .title
                .clone()
                .unwrap_or_else(|| chapter.path.clone()),
            href: Some(chapter.path.clone()),
            anchor_id: Some(chapter_section_id(&chapter.path)),
            children: Vec::new(),
        })
        .collect()
}

fn normalized_navigation_target(
    href: &str,
    base_path: &str,
    package: &EpubPackage,
) -> Option<(String, Option<String>)> {
    let trimmed = href.trim();
    if trimmed.is_empty() || is_external_url(trimmed) {
        return None;
    }

    let (path_part, suffix) = split_resource_suffix(trimmed);
    let resolved_path = if path_part.is_empty() {
        base_path.to_string()
    } else {
        resolve_archive_path(base_path, path_part)
    };
    let item = package.manifest_by_path.get(&resolved_path)?;
    if item.media_type != "application/xhtml+xml" && item.media_type != "text/html" {
        return None;
    }

    let fragment = suffix.strip_prefix('#').unwrap_or_default();
    if fragment.is_empty() {
        return Some((
            resolved_path.clone(),
            Some(chapter_section_id(&resolved_path)),
        ));
    }

    Some((
        format!("{resolved_path}#{fragment}"),
        Some(fragment_anchor_id(&resolved_path, fragment)),
    ))
}

fn collect_head_stylesheet_paths(
    document: &Document<'_>,
    chapter_path: &str,
    stylesheet_paths: &mut BTreeSet<String>,
) {
    for link in document
        .descendants()
        .filter(|node| node.is_element() && node.tag_name().name() == "link")
    {
        let rel = link
            .attribute("rel")
            .unwrap_or_default()
            .to_ascii_lowercase();
        let href = link.attribute("href").unwrap_or_default();
        if rel.contains("stylesheet") && !href.trim().is_empty() {
            stylesheet_paths.insert(resolve_archive_path(chapter_path, href));
        }
    }
}

/// Scope all CSS selectors in an EPUB stylesheet to `.epub-preview` so that
/// epub-internal styles do not leak out to the host page.
///
/// Transformations applied:
/// - `@charset`, `@namespace`, and `@import` directives are stripped.
/// - `body` and `html` selectors are replaced with `.epub-preview`.
/// - All other selectors are prefixed with `.epub-preview `.
/// - Comma-separated selector lists are handled per-item.
/// - `@media` blocks are preserved; their inner rules are scoped.
/// - `@keyframes`, `@font-face`, and other at-rules are passed through unchanged.
/// - `/* ... */` comments and quoted strings are skipped without modification.
fn scope_epub_css(css: &str) -> String {
    let mut out = String::with_capacity(css.len());
    let bytes = css.as_bytes();
    let len = bytes.len();
    let mut i = 0;
    // brace_depth tracks nesting: 0 = top-level, 1 = inside a rule block, etc.
    let mut brace_depth: usize = 0;

    while i < len {
        // Skip block comments.
        if i + 1 < len && bytes[i] == b'/' && bytes[i + 1] == b'*' {
            out.push_str("/*");
            i += 2;
            while i + 1 < len {
                if bytes[i] == b'*' && bytes[i + 1] == b'/' {
                    out.push_str("*/");
                    i += 2;
                    break;
                }
                out.push(bytes[i] as char);
                i += 1;
            }
            continue;
        }

        // Inside a rule block: copy verbatim (track nested braces).
        if brace_depth > 0 {
            match bytes[i] {
                b'{' => {
                    brace_depth += 1;
                    out.push('{');
                    i += 1;
                }
                b'}' => {
                    brace_depth -= 1;
                    out.push('}');
                    i += 1;
                }
                b'\'' | b'"' => {
                    let quote = bytes[i];
                    out.push(quote as char);
                    i += 1;
                    while i < len {
                        let ch = bytes[i];
                        out.push(ch as char);
                        i += 1;
                        if ch == quote {
                            break;
                        }
                        if ch == b'\\' && i < len {
                            out.push(bytes[i] as char);
                            i += 1;
                        }
                    }
                }
                ch => {
                    out.push(ch as char);
                    i += 1;
                }
            }
            continue;
        }

        // --- Top-level (brace_depth == 0) ---

        // Skip whitespace, collecting it so we can emit it later.
        if bytes[i].is_ascii_whitespace() {
            let start = i;
            while i < len && bytes[i].is_ascii_whitespace() {
                i += 1;
            }
            // Only emit the whitespace if we are not at a directive/selector boundary
            // that we may discard; simpler to just always emit whitespace here.
            out.push_str(&css[start..i]);
            continue;
        }

        // At-rules at the top level.
        if bytes[i] == b'@' {
            // Collect the at-keyword.
            let at_start = i;
            i += 1; // skip '@'
            while i < len && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'-') {
                i += 1;
            }
            let keyword = &css[at_start + 1..i];

            match keyword {
                "charset" | "namespace" | "import" => {
                    // Strip: advance to end of statement (';') or block ('{...}').
                    while i < len {
                        match bytes[i] {
                            b';' => {
                                i += 1;
                                break;
                            }
                            b'{' => {
                                // Consume the entire block.
                                i += 1;
                                let mut depth = 1usize;
                                while i < len && depth > 0 {
                                    match bytes[i] {
                                        b'{' => depth += 1,
                                        b'}' => depth -= 1,
                                        _ => {}
                                    }
                                    i += 1;
                                }
                                break;
                            }
                            _ => {
                                i += 1;
                            }
                        }
                    }
                }
                "media" => {
                    // Emit `@media ...` header verbatim up to and including the opening `{`,
                    // then scope each rule inside by recursing into the inner CSS text.
                    // Collect everything from the '@' up to (and including) the opening '{'.
                    let header_start = at_start;
                    while i < len && bytes[i] != b'{' {
                        i += 1;
                    }
                    if i < len {
                        i += 1; // consume '{'
                    }
                    // Emit the @media header.
                    out.push_str(&css[header_start..i]);

                    // Find the matching closing '}'.
                    let inner_start = i;
                    let mut depth = 1usize;
                    while i < len && depth > 0 {
                        match bytes[i] {
                            b'/' if i + 1 < len && bytes[i + 1] == b'*' => {
                                // Skip comment inside @media search.
                                i += 2;
                                while i + 1 < len {
                                    if bytes[i] == b'*' && bytes[i + 1] == b'/' {
                                        i += 2;
                                        break;
                                    }
                                    i += 1;
                                }
                            }
                            b'{' => {
                                depth += 1;
                                i += 1;
                            }
                            b'}' => {
                                depth -= 1;
                                if depth > 0 {
                                    i += 1;
                                }
                                // do not advance past the final '}' yet
                                if depth == 0 {
                                    break;
                                }
                            }
                            _ => {
                                i += 1;
                            }
                        }
                    }
                    let inner_css = &css[inner_start..i];
                    out.push_str(&scope_epub_css(inner_css));
                    if i < len && bytes[i] == b'}' {
                        out.push('}');
                        i += 1;
                    }
                }
                _ => {
                    // Other at-rules (@keyframes, @font-face, etc.): pass through verbatim.
                    out.push_str(&css[at_start..i]);
                    // Emit the rest up to end of block or ';'.
                    while i < len {
                        match bytes[i] {
                            b';' => {
                                out.push(';');
                                i += 1;
                                break;
                            }
                            b'{' => {
                                out.push('{');
                                i += 1;
                                brace_depth += 1;
                                break;
                            }
                            ch => {
                                out.push(ch as char);
                                i += 1;
                            }
                        }
                    }
                }
            }
            continue;
        }

        // Regular selector rule: collect selector text up to '{'.
        if bytes[i] == b'}' {
            // Stray closing brace (e.g. end of @media inner); just emit and continue.
            out.push('}');
            i += 1;
            continue;
        }

        // Collect selector up to '{', respecting strings and comments.
        let selector_start = i;
        while i < len && bytes[i] != b'{' {
            match bytes[i] {
                b'/' if i + 1 < len && bytes[i + 1] == b'*' => {
                    // skip comment inside selector
                    i += 2;
                    while i + 1 < len {
                        if bytes[i] == b'*' && bytes[i + 1] == b'/' {
                            i += 2;
                            break;
                        }
                        i += 1;
                    }
                }
                b'\'' | b'"' => {
                    let q = bytes[i];
                    i += 1;
                    while i < len {
                        if bytes[i] == q {
                            i += 1;
                            break;
                        }
                        if bytes[i] == b'\\' {
                            i += 1;
                        }
                        i += 1;
                    }
                }
                _ => {
                    i += 1;
                }
            }
        }
        let raw_selector = css[selector_start..i].trim();

        if raw_selector.is_empty() {
            // No selector before '{', just emit brace if present.
            if i < len && bytes[i] == b'{' {
                out.push('{');
                i += 1;
                brace_depth += 1;
            }
            continue;
        }

        // Scope each comma-separated part.
        let scoped = scope_selector_list(raw_selector);
        out.push_str(&scoped);

        if i < len && bytes[i] == b'{' {
            out.push('{');
            i += 1;
            brace_depth += 1;
        }
    }

    out
}

/// Scope a (possibly comma-separated) selector list.
fn scope_selector_list(selector_list: &str) -> String {
    let parts: Vec<&str> = selector_list.split(',').collect();
    let scoped_parts: Vec<String> = parts
        .iter()
        .map(|part| scope_single_selector(part.trim()))
        .collect();
    scoped_parts.join(", ")
}

/// Scope a single selector to `.epub-preview`.
fn scope_single_selector(selector: &str) -> String {
    // Normalise whitespace for comparison only.
    let lower = selector.to_ascii_lowercase();
    let trimmed = lower.trim();
    if trimmed == "body" || trimmed == "html" || trimmed == "html body" {
        ".epub-preview".to_string()
    } else if trimmed.starts_with("body ")
        || trimmed.starts_with("body>")
        || trimmed.starts_with("body+")
        || trimmed.starts_with("body~")
    {
        // body .foo -> .epub-preview .foo
        format!(".epub-preview {}", &selector[4..].trim_start())
    } else if trimmed.starts_with("html ") {
        format!(".epub-preview {}", &selector[4..].trim_start())
    } else {
        format!(".epub-preview {selector}")
    }
}

fn render_stylesheet_block(
    archive: &mut ZipArchive<File>,
    epub_path: &Path,
    package: &EpubPackage,
    stylesheet_paths: &BTreeSet<String>,
) -> AppResult<Option<String>> {
    let mut styles = String::new();
    for stylesheet_path in stylesheet_paths {
        let Some(css) = try_read_zip_string(archive, stylesheet_path, epub_path)? else {
            continue;
        };
        let rewritten_css = rewrite_css_urls(&css, stylesheet_path, archive, epub_path, package)?;
        let scoped_css = scope_epub_css(&rewritten_css);
        styles.push_str(&scoped_css);
        styles.push('\n');
    }

    if styles.trim().is_empty() {
        return Ok(None);
    }

    Ok(Some(format!(
        "<style class=\"epub-preview__styles\">{styles}</style>"
    )))
}

fn render_chapter_body(
    document: &Document<'_>,
    archive: &mut ZipArchive<File>,
    epub_path: &Path,
    context: &RenderContext<'_>,
) -> AppResult<String> {
    let body = document
        .descendants()
        .find(|node| node.is_element() && node.tag_name().name() == "body")
        .ok_or_else(|| {
            AppError::epub_parse(
                epub_path,
                format!(
                    "chapter `{}` is missing a body element",
                    context.chapter_path
                ),
            )
        })?;

    let mut html = String::new();
    for child in body.children() {
        render_node(child, archive, epub_path, context, &mut html)?;
    }
    Ok(html)
}

fn render_node(
    node: Node<'_, '_>,
    archive: &mut ZipArchive<File>,
    epub_path: &Path,
    context: &RenderContext<'_>,
    output: &mut String,
) -> AppResult<()> {
    match node.node_type() {
        NodeType::Text => {
            output.push_str(&escape_html_text(node.text().unwrap_or_default()));
            Ok(())
        }
        NodeType::Element => {
            let tag_name = node.tag_name().name();
            if should_skip_epub_element_subtree(tag_name) {
                return Ok(());
            }

            if !is_allowed_epub_element(tag_name) {
                for child in node.children() {
                    render_node(child, archive, epub_path, context, output)?;
                }
                return Ok(());
            }

            output.push('<');
            output.push_str(tag_name);
            let mut data_epub_href = None;

            for attribute in node.attributes() {
                let attribute_name = attribute.name();
                if attribute_name.starts_with("on")
                    || !is_allowed_epub_attribute(tag_name, attribute_name)
                {
                    continue;
                }

                let serialized_name = match attribute.namespace() {
                    Some("http://www.w3.org/1999/xlink") if attribute_name == "href" => {
                        "xlink:href"
                    }
                    Some("http://www.w3.org/2000/xmlns/") => continue,
                    _ => attribute_name,
                };

                let Some(rewritten_value) = rewrite_attribute_value(
                    tag_name,
                    attribute_name,
                    attribute.value(),
                    archive,
                    epub_path,
                    context,
                )?
                else {
                    continue;
                };
                if attribute_name == "id" {
                    data_epub_href = Some(format!(
                        "{}#{}",
                        context.chapter_path,
                        attribute.value().trim()
                    ));
                }

                output.push(' ');
                output.push_str(serialized_name);
                output.push_str("=\"");
                output.push_str(&escape_html_attribute(&rewritten_value));
                output.push('"');
            }
            if let Some(data_epub_href) = data_epub_href {
                output.push_str(" data-epub-href=\"");
                output.push_str(&escape_html_attribute(&data_epub_href));
                output.push('"');
            }

            output.push('>');
            for child in node.children() {
                render_node(child, archive, epub_path, context, output)?;
            }
            output.push_str("</");
            output.push_str(tag_name);
            output.push('>');
            Ok(())
        }
        NodeType::Comment | NodeType::PI | NodeType::Root => {
            for child in node.children() {
                render_node(child, archive, epub_path, context, output)?;
            }
            Ok(())
        }
    }
}

fn should_skip_epub_element_subtree(tag_name: &str) -> bool {
    matches!(
        tag_name,
        "script"
            | "noscript"
            | "iframe"
            | "object"
            | "embed"
            | "form"
            | "input"
            | "button"
            | "select"
            | "textarea"
            | "meta"
            | "link"
            | "svg"
            | "math"
    )
}

fn is_allowed_epub_element(tag_name: &str) -> bool {
    matches!(
        tag_name,
        "a" | "abbr"
            | "article"
            | "aside"
            | "b"
            | "blockquote"
            | "br"
            | "caption"
            | "cite"
            | "code"
            | "col"
            | "colgroup"
            | "dd"
            | "del"
            | "dfn"
            | "div"
            | "dl"
            | "dt"
            | "em"
            | "figcaption"
            | "figure"
            | "h1"
            | "h2"
            | "h3"
            | "h4"
            | "h5"
            | "h6"
            | "hr"
            | "i"
            | "img"
            | "ins"
            | "li"
            | "main"
            | "mark"
            | "ol"
            | "p"
            | "pre"
            | "q"
            | "rp"
            | "rt"
            | "ruby"
            | "s"
            | "section"
            | "small"
            | "span"
            | "strong"
            | "sub"
            | "sup"
            | "table"
            | "tbody"
            | "td"
            | "tfoot"
            | "th"
            | "thead"
            | "tr"
            | "u"
            | "ul"
    )
}

fn is_allowed_epub_attribute(tag_name: &str, attribute_name: &str) -> bool {
    if matches!(attribute_name, "id" | "class" | "title" | "lang" | "dir") {
        return true;
    }

    match tag_name {
        "a" => attribute_name == "href",
        "img" => matches!(attribute_name, "src" | "alt" | "width" | "height"),
        "td" | "th" => matches!(attribute_name, "colspan" | "rowspan" | "scope"),
        "ol" => matches!(attribute_name, "start" | "type"),
        "ul" => attribute_name == "type",
        _ => false,
    }
}

fn rewrite_attribute_value(
    tag_name: &str,
    attribute_name: &str,
    value: &str,
    archive: &mut ZipArchive<File>,
    epub_path: &Path,
    context: &RenderContext<'_>,
) -> AppResult<Option<String>> {
    match attribute_name {
        "id" => Ok(Some(fragment_anchor_id(context.chapter_path, value))),
        "src" | "poster" => rewrite_archive_resource_reference(
            value,
            context.chapter_path,
            archive,
            epub_path,
            context.package,
        ),
        "href" => {
            if tag_name == "a" {
                rewrite_anchor_href(value, context)
            } else {
                rewrite_archive_resource_reference(
                    value,
                    context.chapter_path,
                    archive,
                    epub_path,
                    context.package,
                )
            }
        }
        _ => Ok(Some(value.to_string())),
    }
}

fn rewrite_anchor_href(value: &str, context: &RenderContext<'_>) -> AppResult<Option<String>> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.starts_with("data:") {
        return Ok(None);
    }

    if is_external_url(trimmed) {
        return if is_safe_external_epub_link(trimmed) {
            Ok(Some(trimmed.to_string()))
        } else {
            Ok(None)
        };
    }

    if trimmed.starts_with('#') {
        let fragment = trimmed.trim_start_matches('#');
        if fragment.is_empty() {
            return Ok(Some(format!(
                "#{}",
                chapter_section_id(context.chapter_path)
            )));
        }
        return Ok(Some(format!(
            "#{}",
            fragment_anchor_id(context.chapter_path, fragment)
        )));
    }

    if let Some((_, Some(anchor_id))) =
        normalized_navigation_target(trimmed, context.chapter_path, context.package)
    {
        return Ok(Some(format!("#{anchor_id}")));
    }

    let (path_part, _) = split_resource_suffix(trimmed);
    let resolved_path = if path_part.is_empty() {
        context.chapter_path.to_string()
    } else {
        resolve_archive_path(context.chapter_path, path_part)
    };
    if let Some(item) = context.package.manifest_by_path.get(&resolved_path) {
        if item.media_type == "application/xhtml+xml" || item.media_type == "text/html" {
            return Ok(Some(format!("#{}", chapter_section_id(&resolved_path))));
        }
    }

    Ok(None)
}

fn rewrite_archive_resource_reference(
    value: &str,
    base_path: &str,
    archive: &mut ZipArchive<File>,
    epub_path: &Path,
    package: &EpubPackage,
) -> AppResult<Option<String>> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with("data:") {
        return Ok(None);
    }

    if is_external_url(trimmed) {
        return Ok(None);
    }

    let (path_part, suffix) = split_resource_suffix(trimmed);
    let resolved_path = resolve_archive_path(base_path, path_part);
    let Some(media_type) = media_type_for_archive_path(package, &resolved_path) else {
        return Ok(None);
    };

    if media_type == "application/xhtml+xml" || media_type == "text/html" {
        return Ok(Some(format!(
            "#{}{}",
            chapter_section_id(&resolved_path),
            suffix
        )));
    }

    let Some(bytes) = try_read_zip_bytes(archive, &resolved_path, epub_path)? else {
        return Ok(None);
    };
    Ok(Some(data_url(media_type, &bytes)))
}

fn rewrite_css_urls(
    css: &str,
    base_path: &str,
    archive: &mut ZipArchive<File>,
    epub_path: &Path,
    package: &EpubPackage,
) -> AppResult<String> {
    let mut rewritten = String::with_capacity(css.len());
    let mut remaining = css;

    while let Some(position) = remaining.find("url(") {
        rewritten.push_str(&remaining[..position + 4]);
        let after_open = &remaining[position + 4..];
        let Some(end) = after_open.find(')') else {
            rewritten.push_str(after_open);
            return Ok(rewritten);
        };

        let raw_target = after_open[..end].trim();
        let unquoted_target = raw_target
            .strip_prefix('"')
            .and_then(|value| value.strip_suffix('"'))
            .or_else(|| {
                raw_target
                    .strip_prefix('\'')
                    .and_then(|value| value.strip_suffix('\''))
            })
            .unwrap_or(raw_target);
        let resolved_target = rewrite_archive_resource_reference(
            unquoted_target,
            base_path,
            archive,
            epub_path,
            package,
        )?;
        rewritten.push('"');
        if let Some(resolved_target) = resolved_target {
            rewritten.push_str(&resolved_target);
        }
        rewritten.push_str("\")");
        remaining = &after_open[end + 1..];
    }

    rewritten.push_str(remaining);
    Ok(rewritten)
}

fn is_safe_external_epub_link(value: &str) -> bool {
    let lower = value.trim().to_ascii_lowercase();
    lower.starts_with("http://") || lower.starts_with("https://")
}

fn media_type_for_archive_path<'a>(
    package: &'a EpubPackage,
    archive_path: &str,
) -> Option<&'a str> {
    package
        .manifest_by_path
        .get(archive_path)
        .map(|item| item.media_type.as_str())
        .or_else(|| inferred_media_type_from_path(archive_path))
}

fn inferred_media_type_from_path(archive_path: &str) -> Option<&'static str> {
    let extension = archive_path.rsplit_once('.')?.1.to_ascii_lowercase();
    match extension.as_str() {
        "css" => Some("text/css"),
        "gif" => Some("image/gif"),
        "jpeg" | "jpg" => Some("image/jpeg"),
        "png" => Some("image/png"),
        "svg" => Some("image/svg+xml"),
        "webp" => Some("image/webp"),
        "avif" => Some("image/avif"),
        "mp3" => Some("audio/mpeg"),
        "mp4" => Some("video/mp4"),
        "webm" => Some("video/webm"),
        _ => None,
    }
}

fn split_resource_suffix(value: &str) -> (&str, &str) {
    let suffix_index = value.find(['?', '#']).unwrap_or(value.len());
    (&value[..suffix_index], &value[suffix_index..])
}

fn resolve_archive_path(base_path: &str, relative_path: &str) -> String {
    let base_directory = base_path
        .rsplit_once('/')
        .map(|(directory, _)| directory)
        .unwrap_or("");
    resolve_archive_path_from_directory(base_directory, relative_path)
}

fn resolve_archive_path_from_directory(base_directory: &str, relative_path: &str) -> String {
    if relative_path.starts_with('/') {
        return normalize_archive_path(relative_path);
    }

    let joined = if base_directory.is_empty() {
        relative_path.to_string()
    } else {
        format!("{base_directory}/{relative_path}")
    };
    normalize_archive_path(&joined)
}

fn normalize_archive_path(path: &str) -> String {
    let mut segments = Vec::new();
    for segment in path.split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                segments.pop();
            }
            _ => segments.push(segment),
        }
    }
    segments.join("/")
}

fn chapter_section_id(chapter_path: &str) -> String {
    let mut id = String::from("epub-chapter-");
    for character in chapter_path.chars() {
        if character.is_ascii_alphanumeric() {
            id.push(character.to_ascii_lowercase());
        } else {
            id.push('-');
        }
    }
    id
}

fn fragment_anchor_id(chapter_path: &str, fragment_id: &str) -> String {
    let mut id = chapter_section_id(chapter_path);
    id.push_str("-frag-");
    for character in fragment_id.chars() {
        if character.is_ascii_alphanumeric() {
            id.push(character.to_ascii_lowercase());
        } else {
            id.push('-');
        }
    }
    id
}

fn strip_xml_doctype(xml: &str) -> Cow<'_, str> {
    let lower = xml.to_ascii_lowercase();
    let Some(start) = lower.find("<!doctype") else {
        return Cow::Borrowed(xml);
    };

    let bytes = xml.as_bytes();
    let mut index = start + "<!DOCTYPE".len();
    let mut bracket_depth = 0_u32;
    let mut active_quote: Option<u8> = None;

    while index < bytes.len() {
        let byte = bytes[index];
        match active_quote {
            Some(quote) => {
                if byte == quote {
                    active_quote = None;
                }
            }
            None => match byte {
                b'"' | b'\'' => active_quote = Some(byte),
                b'[' => bracket_depth += 1,
                b']' => bracket_depth = bracket_depth.saturating_sub(1),
                b'>' if bracket_depth == 0 => {
                    let mut sanitized = String::with_capacity(xml.len());
                    sanitized.push_str(&xml[..start]);
                    sanitized.push_str(&xml[index + 1..]);
                    return Cow::Owned(sanitized);
                }
                _ => {}
            },
        }

        index += 1;
    }

    Cow::Borrowed(xml)
}

fn data_url(media_type: &str, bytes: &[u8]) -> String {
    format!(
        "data:{media_type};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    )
}

fn is_external_url(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    lower.starts_with("http://")
        || lower.starts_with("https://")
        || lower.starts_with("mailto:")
        || lower.starts_with("tel:")
        || lower.starts_with("//")
}

fn escape_html_text(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn escape_html_attribute(value: &str) -> String {
    escape_html_text(value)
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

#[cfg(test)]
mod tests {
    use std::{
        collections::HashMap,
        fs,
        io::{self, Cursor, Read, Seek, SeekFrom, Write},
        path::{Path, PathBuf},
        sync::{
            atomic::{AtomicBool, AtomicU64, Ordering},
            Arc,
        },
        time::{SystemTime, UNIX_EPOCH},
    };

    use zip::{result::ZipError, write::FileOptions, CompressionMethod, ZipArchive, ZipWriter};

    use super::{
        is_allowed_epub_attribute, is_allowed_epub_element, rewrite_anchor_href,
        should_skip_epub_element_subtree, EpubPackage, RenderContext,
    };
    use crate::{error::AppError, verbose_log};

    static TEST_DIR_COUNTER: AtomicU64 = AtomicU64::new(0);

    struct TestDir {
        path: PathBuf,
    }

    struct ToggleIoReader {
        inner: Cursor<Vec<u8>>,
        fail_io: Arc<AtomicBool>,
    }

    impl Read for ToggleIoReader {
        fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
            if self.fail_io.load(Ordering::Relaxed) {
                return Err(io::Error::from_raw_os_error(5));
            }
            self.inner.read(buffer)
        }
    }

    impl Seek for ToggleIoReader {
        fn seek(&mut self, position: SeekFrom) -> io::Result<u64> {
            if self.fail_io.load(Ordering::Relaxed) {
                return Err(io::Error::from_raw_os_error(5));
            }
            self.inner.seek(position)
        }
    }

    impl TestDir {
        fn new() -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos();
            let process_id = std::process::id();
            let counter = TEST_DIR_COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir()
                .join(format!("chilla-epub-tests-{process_id}-{unique}-{counter}"));
            fs::create_dir_all(&path).expect("create EPUB test directory");
            Self { path }
        }

        fn path(&self) -> &Path {
            &self.path
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn empty_package() -> EpubPackage {
        EpubPackage {
            title: None,
            author: None,
            manifest_by_path: HashMap::new(),
            spine_paths: vec!["chapter.xhtml".to_string()],
            navigation_document_path: None,
            toc_ncx_path: None,
        }
    }

    #[test]
    fn epub_policy_drops_active_content_elements() {
        for tag_name in ["script", "iframe", "object", "embed", "form", "svg"] {
            assert!(should_skip_epub_element_subtree(tag_name));
            assert!(!is_allowed_epub_element(tag_name));
        }
    }

    #[test]
    fn epub_policy_limits_attributes_by_element() {
        assert!(is_allowed_epub_attribute("a", "href"));
        assert!(is_allowed_epub_attribute("img", "src"));
        assert!(is_allowed_epub_attribute("p", "class"));
        assert!(!is_allowed_epub_attribute("img", "srcset"));
        assert!(!is_allowed_epub_attribute("a", "style"));
        assert!(!is_allowed_epub_attribute("button", "formaction"));
    }

    #[test]
    fn epub_anchor_rewrite_rejects_data_and_protocol_relative_urls() {
        let package = empty_package();
        let context = RenderContext {
            chapter_path: "chapter.xhtml",
            package: &package,
        };

        assert_eq!(
            rewrite_anchor_href("data:text/html,hi", &context).unwrap(),
            None
        );
        assert_eq!(
            rewrite_anchor_href("//example.com", &context).unwrap(),
            None
        );
        assert_eq!(
            rewrite_anchor_href("https://example.com", &context).unwrap(),
            Some("https://example.com".to_string())
        );
    }

    #[test]
    fn render_epub_records_open_and_entry_reads_without_changing_quiet_result() {
        let test_dir = TestDir::new();
        let path = test_dir.path().join("observed.epub");
        write_minimal_epub(&path);
        let canonical_path = path.canonicalize().expect("canonical EPUB path");

        let (quiet_result, quiet_lines) =
            verbose_log::with_disabled_test_sink(|| super::render_epub(&canonical_path));
        let quiet_rendered = quiet_result.expect("quiet EPUB render");
        let (verbose_result, verbose_lines) =
            verbose_log::with_test_sink(|| super::render_epub(&canonical_path));
        let verbose_rendered = verbose_result.expect("verbose EPUB render");

        assert_eq!(verbose_rendered.html, quiet_rendered.html);
        assert_eq!(verbose_rendered.toc, quiet_rendered.toc);
        assert!(quiet_lines.is_empty());

        let open_records = verbose_lines
            .iter()
            .filter(|line| line.contains("operation=\"open_epub_archive\""))
            .collect::<Vec<_>>();
        assert_eq!(open_records.len(), 1);
        assert!(open_records[0].contains("outcome=\"success\""));
        assert!(open_records[0].contains("duration_ms="));
        assert!(open_records[0].contains(&format!("path=\"{}\"", canonical_path.display())));
        assert!(open_records[0].contains("size_bytes=unavailable"));

        let archive_records = verbose_lines
            .iter()
            .filter(|line| line.contains("operation=\"open_epub_zip_archive\""))
            .collect::<Vec<_>>();
        assert_eq!(archive_records.len(), 1);
        assert!(archive_records[0].contains("outcome=\"success\""));
        assert!(archive_records[0].contains("duration_ms="));
        assert!(archive_records[0].contains(&format!("path=\"{}\"", canonical_path.display())));
        assert!(archive_records[0].contains("size_bytes=unavailable"));

        let lookup_records = verbose_lines
            .iter()
            .filter(|line| line.contains("operation=\"lookup_epub_archive_entry\""))
            .collect::<Vec<_>>();
        assert_eq!(lookup_records.len(), 3);
        assert!(lookup_records.iter().all(|line| {
            line.contains("outcome=\"success\"")
                && line.contains("duration_ms=")
                && line.contains(&format!("path=\"{}\"", canonical_path.display()))
                && line.contains("size_bytes=")
                && !line.contains("size_bytes=unavailable")
        }));

        let read_records = verbose_lines
            .iter()
            .filter(|line| line.contains("operation=\"read_epub_archive_entry\""))
            .collect::<Vec<_>>();
        assert_eq!(read_records.len(), 3);
        assert!(read_records.iter().all(|line| {
            line.contains("outcome=\"success\"")
                && line.contains("duration_ms=")
                && line.contains(&format!("path=\"{}\"", canonical_path.display()))
                && line.contains("size_bytes=")
                && !line.contains("size_bytes=unavailable")
        }));
    }

    #[test]
    fn render_epub_records_open_failure_before_app_error_mapping() {
        let test_dir = TestDir::new();
        let missing_path = test_dir.path().join("missing.epub");

        let (error, lines) = verbose_log::with_test_sink(|| {
            super::render_epub(&missing_path).expect_err("missing EPUB should fail")
        });

        assert!(matches!(error, AppError::Io { action: "open", .. }));
        assert_eq!(lines.len(), 1);
        assert!(lines[0].contains("operation=\"open_epub_archive\""));
        assert!(lines[0].contains("outcome=\"failure\""));
        assert!(lines[0].contains("duration_ms="));
        assert!(lines[0].contains(&format!("path=\"{}\"", missing_path.display())));
        assert!(lines[0].contains("size_bytes=unavailable"));
        assert!(lines[0].contains("error="));
        assert!(lines[0].contains("raw_os_error="));
        assert!(!lines[0].contains("raw_os_error=unavailable"));
    }

    #[test]
    fn corrupted_archive_entry_read_is_recorded_before_epub_error_mapping() {
        let test_dir = TestDir::new();
        let path = test_dir.path().join("corrupt.epub");
        write_corrupt_epub_entry(&path);
        let canonical_path = path.canonicalize().expect("canonical EPUB path");

        let (error, lines) = verbose_log::with_test_sink(|| {
            let file = super::observed_open_epub(&canonical_path).expect("open corrupt EPUB");
            let mut archive = ZipArchive::new(file).expect("open corrupt ZIP structure");
            super::read_zip_bytes(&mut archive, "payload.bin", &canonical_path)
                .expect_err("corrupt entry read should fail")
        });

        assert!(matches!(error, AppError::EpubParse { .. }));
        let read_failure = lines
            .iter()
            .find(|line| {
                line.contains("operation=\"read_epub_archive_entry\"")
                    && line.contains("outcome=\"failure\"")
            })
            .expect("archive entry read failure record");
        assert!(read_failure.contains("duration_ms="));
        assert!(read_failure.contains(&format!("path=\"{}\"", canonical_path.display())));
        assert!(read_failure.contains("size_bytes=unavailable"));
        assert!(read_failure.contains("error="));
        assert!(read_failure.contains("raw_os_error=unavailable"));
    }

    #[test]
    fn zip_archive_construction_io_failure_is_recorded_before_mapping() {
        let test_dir = TestDir::new();
        let epub_path = test_dir.path().join("construction-io.epub");
        let fail_io = Arc::new(AtomicBool::new(true));
        let reader = ToggleIoReader {
            inner: Cursor::new(Vec::new()),
            fail_io,
        };

        let (error, lines) =
            verbose_log::with_test_sink(|| {
                match super::observed_open_zip_archive(reader, &epub_path) {
                    Err(ZipError::Io(error)) => error,
                    Err(other) => panic!("expected ZIP I/O error, got {other}"),
                    Ok(_) => panic!("expected ZIP archive construction to fail"),
                }
            });

        assert_eq!(error.raw_os_error(), Some(5));
        assert_eq!(lines.len(), 1);
        assert!(lines[0].contains("operation=\"open_epub_zip_archive\""));
        assert!(lines[0].contains("outcome=\"failure\""));
        assert!(lines[0].contains("duration_ms="));
        assert!(lines[0].contains(&format!("path=\"{}\"", epub_path.display())));
        assert!(lines[0].contains("size_bytes=unavailable"));
        assert!(lines[0].contains("error="));
        assert!(lines[0].contains("raw_os_error=5"));
    }

    #[test]
    fn archive_entry_lookup_io_failure_is_recorded_before_mapping() {
        let test_dir = TestDir::new();
        let path = test_dir.path().join("lookup-io.epub");
        write_minimal_epub(&path);
        let canonical_path = path.canonicalize().expect("canonical EPUB path");
        let archive_bytes = fs::read(&canonical_path).expect("read EPUB fixture");
        let fail_io = Arc::new(AtomicBool::new(false));
        let reader = ToggleIoReader {
            inner: Cursor::new(archive_bytes),
            fail_io: Arc::clone(&fail_io),
        };
        let mut archive = ZipArchive::new(reader).expect("open EPUB fixture");
        fail_io.store(true, Ordering::Relaxed);

        let (error, lines) =
            verbose_log::with_test_sink(|| {
                match super::observed_lookup_epub_entry(
                    &mut archive,
                    "META-INF/container.xml",
                    &canonical_path,
                ) {
                    Err(ZipError::Io(error)) => error,
                    Err(other) => panic!("expected ZIP I/O error, got {other}"),
                    Ok(_) => panic!("expected archive entry lookup to fail"),
                }
            });

        assert_eq!(error.raw_os_error(), Some(5));
        assert_eq!(lines.len(), 1);
        assert!(lines[0].contains("operation=\"lookup_epub_archive_entry\""));
        assert!(lines[0].contains("outcome=\"failure\""));
        assert!(lines[0].contains("duration_ms="));
        assert!(lines[0].contains(&format!("path=\"{}\"", canonical_path.display())));
        assert!(lines[0].contains("size_bytes=unavailable"));
        assert!(lines[0].contains("error="));
        assert!(lines[0].contains("raw_os_error=5"));
    }

    fn write_minimal_epub(path: &Path) {
        let file = fs::File::create(path).expect("create EPUB fixture");
        let mut archive = ZipWriter::new(file);
        let options = FileOptions::default().compression_method(CompressionMethod::Deflated);

        archive
            .start_file("META-INF/container.xml", options)
            .expect("start container entry");
        archive
            .write_all(
                br#"<?xml version="1.0"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf"/>
  </rootfiles>
</container>"#,
            )
            .expect("write container entry");

        archive
            .start_file("OEBPS/content.opf", options)
            .expect("start package entry");
        archive
            .write_all(
                br#"<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Observed EPUB</dc:title>
  </metadata>
  <manifest>
    <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="chapter"/>
  </spine>
</package>"#,
            )
            .expect("write package entry");

        archive
            .start_file("OEBPS/chapter.xhtml", options)
            .expect("start chapter entry");
        archive
            .write_all(
                br#"<?xml version="1.0"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>Observed Chapter</title></head>
  <body><h1>Observed Chapter</h1><p>EPUB body.</p></body>
</html>"#,
            )
            .expect("write chapter entry");
        archive.finish().expect("finish EPUB fixture");
    }

    fn write_corrupt_epub_entry(path: &Path) {
        const PAYLOAD: &[u8] = b"chilla-corrupt-epub-entry-payload";

        let file = fs::File::create(path).expect("create corrupt EPUB fixture");
        let mut archive = ZipWriter::new(file);
        let options = FileOptions::default().compression_method(CompressionMethod::Stored);
        archive
            .start_file("payload.bin", options)
            .expect("start corrupt payload entry");
        archive
            .write_all(PAYLOAD)
            .expect("write corrupt payload entry");
        archive.finish().expect("finish corrupt EPUB fixture");

        let mut bytes = fs::read(path).expect("read corrupt EPUB fixture");
        let payload_offset = bytes
            .windows(PAYLOAD.len())
            .position(|window| window == PAYLOAD)
            .expect("locate stored payload");
        bytes[payload_offset] ^= 0xff;
        fs::write(path, bytes).expect("corrupt stored payload");
    }
}
