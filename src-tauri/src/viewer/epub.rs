use std::{
    borrow::Cow,
    collections::{BTreeSet, HashMap},
    fs::File,
    io::Read,
    path::Path,
};

use base64::Engine;
use roxmltree::{Document, Node, NodeType};
use zip::{result::ZipError, ZipArchive};

use crate::error::{AppError, AppResult};

#[derive(Debug)]
pub struct RenderedEpub {
    pub html: String,
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
}

struct RenderContext<'a> {
    chapter_path: &'a str,
    package: &'a EpubPackage,
}

pub fn render_epub(path: &Path) -> AppResult<RenderedEpub> {
    let file = File::open(path).map_err(|source| AppError::io("open", path, source))?;
    let mut archive = ZipArchive::new(file).map_err(|source| {
        AppError::epub_parse(path, format!("failed to open zip archive: {source}"))
    })?;

    let container_xml = read_zip_string(&mut archive, "META-INF/container.xml", path)?;
    let package_path = parse_container_rootfile_path(&container_xml, path)?;
    let package_xml = read_zip_string(&mut archive, &package_path, path)?;
    let package = parse_package_document(&package_xml, &package_path, path)?;

    let mut stylesheet_paths = BTreeSet::new();
    let mut chapter_html = Vec::new();

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
        chapter_html.push((
            spine_path.clone(),
            render_chapter_body(
                &chapter_document,
                &mut archive,
                path,
                &RenderContext {
                    chapter_path: spine_path,
                    package: &package,
                },
            )?,
        ));
    }

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

    for (chapter_path, chapter_body_html) in chapter_html {
        html.push_str("<section class=\"epub-preview__chapter\" id=\"");
        html.push_str(&chapter_section_id(&chapter_path));
        html.push_str("\" data-epub-path=\"");
        html.push_str(&escape_html_attribute(&chapter_path));
        html.push_str("\">");
        html.push_str(&chapter_body_html);
        html.push_str("</section>");
    }

    html.push_str("</article></section>");

    Ok(RenderedEpub { html })
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
    let mut entry = archive.by_name(entry_path).map_err(|source| {
        AppError::epub_parse(
            epub_path,
            format!("missing archive entry `{entry_path}`: {source}"),
        )
    })?;
    let mut bytes = Vec::new();
    entry.read_to_end(&mut bytes).map_err(|source| {
        AppError::epub_parse(
            epub_path,
            format!("failed to read archive entry `{entry_path}`: {source}"),
        )
    })?;
    Ok(bytes)
}

fn try_read_zip_bytes(
    archive: &mut ZipArchive<File>,
    entry_path: &str,
    epub_path: &Path,
) -> AppResult<Option<Vec<u8>>> {
    let mut entry = match archive.by_name(entry_path) {
        Ok(entry) => entry,
        Err(ZipError::FileNotFound) => return Ok(None),
        Err(source) => {
            return Err(AppError::epub_parse(
                epub_path,
                format!("failed to access archive entry `{entry_path}`: {source}"),
            ))
        }
    };

    let mut bytes = Vec::new();
    entry.read_to_end(&mut bytes).map_err(|source| {
        AppError::epub_parse(
            epub_path,
            format!("failed to read archive entry `{entry_path}`: {source}"),
        )
    })?;
    Ok(Some(bytes))
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

        let full_path = resolve_archive_path_from_directory(package_directory, href);
        manifest_href_by_id.insert(id.to_string(), full_path.clone());
        manifest_by_path.insert(
            full_path,
            ManifestItem {
                media_type: media_type.to_string(),
            },
        );
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
        styles.push_str(&rewrite_css_urls(
            &css,
            stylesheet_path,
            archive,
            epub_path,
            package,
        )?);
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
            if matches!(tag_name, "script" | "noscript") {
                return Ok(());
            }

            output.push('<');
            output.push_str(tag_name);

            for attribute in node.attributes() {
                let attribute_name = attribute.name();
                if attribute_name.starts_with("on") {
                    continue;
                }

                let serialized_name = match attribute.namespace() {
                    Some("http://www.w3.org/1999/xlink") if attribute_name == "href" => {
                        "xlink:href"
                    }
                    Some("http://www.w3.org/2000/xmlns/") => continue,
                    _ => attribute_name,
                };

                let rewritten_value = rewrite_attribute_value(
                    tag_name,
                    attribute_name,
                    attribute.value(),
                    archive,
                    epub_path,
                    context,
                )?;

                output.push(' ');
                output.push_str(serialized_name);
                output.push_str("=\"");
                output.push_str(&escape_html_attribute(&rewritten_value));
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

fn rewrite_attribute_value(
    tag_name: &str,
    attribute_name: &str,
    value: &str,
    archive: &mut ZipArchive<File>,
    epub_path: &Path,
    context: &RenderContext<'_>,
) -> AppResult<String> {
    match attribute_name {
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
        "style" => rewrite_css_urls(
            value,
            context.chapter_path,
            archive,
            epub_path,
            context.package,
        ),
        _ => Ok(value.to_string()),
    }
}

fn rewrite_anchor_href(value: &str, context: &RenderContext<'_>) -> AppResult<String> {
    let trimmed = value.trim();
    if trimmed.is_empty()
        || trimmed.starts_with('#')
        || trimmed.starts_with("data:")
        || is_external_url(trimmed)
    {
        return Ok(trimmed.to_string());
    }

    let (path_part, _) = split_resource_suffix(trimmed);
    let resolved_path = resolve_archive_path(context.chapter_path, path_part);
    if let Some(item) = context.package.manifest_by_path.get(&resolved_path) {
        if item.media_type == "application/xhtml+xml" || item.media_type == "text/html" {
            return Ok(format!("#{}", chapter_section_id(&resolved_path)));
        }
    }

    Ok(trimmed.to_string())
}

fn rewrite_archive_resource_reference(
    value: &str,
    base_path: &str,
    archive: &mut ZipArchive<File>,
    epub_path: &Path,
    package: &EpubPackage,
) -> AppResult<String> {
    let trimmed = value.trim();
    if trimmed.is_empty()
        || trimmed.starts_with('#')
        || trimmed.starts_with("data:")
        || is_external_url(trimmed)
    {
        return Ok(trimmed.to_string());
    }

    let (path_part, suffix) = split_resource_suffix(trimmed);
    let resolved_path = resolve_archive_path(base_path, path_part);
    let Some(media_type) = media_type_for_archive_path(package, &resolved_path) else {
        return Ok(trimmed.to_string());
    };

    if media_type == "application/xhtml+xml" || media_type == "text/html" {
        return Ok(format!("#{}{}", chapter_section_id(&resolved_path), suffix));
    }

    let Some(bytes) = try_read_zip_bytes(archive, &resolved_path, epub_path)? else {
        return Ok(trimmed.to_string());
    };
    Ok(data_url(media_type, &bytes))
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
        rewritten.push_str(&resolved_target);
        rewritten.push_str("\")");
        remaining = &after_open[end + 1..];
    }

    rewritten.push_str(remaining);
    Ok(rewritten)
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
    let mut id = String::from("epub-");
    for character in chapter_path.chars() {
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
    value.starts_with("http://")
        || value.starts_with("https://")
        || value.starts_with("mailto:")
        || value.starts_with("tel:")
        || value.starts_with("//")
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
