use std::{env, error::Error, path::PathBuf};

use syntect::{
    dumps::dump_to_uncompressed_file,
    parsing::{SyntaxDefinition, SyntaxSet},
};

fn main() -> Result<(), Box<dyn Error>> {
    tauri_build::build();
    println!("cargo:rerun-if-changed=syntaxes/TOML.sublime-syntax");
    println!("cargo:rerun-if-changed=syntaxes/Nix.sublime-syntax");
    println!("cargo:rerun-if-changed=syntaxes/Swift.sublime-syntax");
    println!("cargo:rerun-if-changed=syntaxes/Dockerfile.sublime-syntax");
    println!("cargo:rerun-if-changed=syntaxes/Zig.sublime-syntax");
    println!("cargo:rerun-if-changed=syntaxes/Protobuf.sublime-syntax");
    println!("cargo:rerun-if-changed=syntaxes/Kotlin.sublime-syntax");
    println!("cargo:rerun-if-changed=syntaxes/INI.sublime-syntax");
    println!("cargo:rerun-if-changed=syntaxes/HCL.sublime-syntax");
    println!("cargo:rerun-if-changed=syntaxes/GraphQL.sublime-syntax");

    // Link the complete grammar set once during the build. The embedded artifact
    // keeps lazy syntax loading at runtime, including cross-language contexts.
    let mut builder = SyntaxSet::load_defaults_newlines().into_builder();
    builder.add(SyntaxDefinition::load_from_str(
        include_str!("syntaxes/TOML.sublime-syntax"),
        true,
        Some("TOML.sublime-syntax"),
    )?);
    builder.add(SyntaxDefinition::load_from_str(
        include_str!("syntaxes/Nix.sublime-syntax"),
        true,
        Some("Nix.sublime-syntax"),
    )?);
    builder.add(SyntaxDefinition::load_from_str(
        include_str!("syntaxes/Swift.sublime-syntax"),
        true,
        Some("Swift.sublime-syntax"),
    )?);
    builder.add(SyntaxDefinition::load_from_str(
        include_str!("syntaxes/Dockerfile.sublime-syntax"),
        true,
        Some("Dockerfile.sublime-syntax"),
    )?);
    builder.add(SyntaxDefinition::load_from_str(
        include_str!("syntaxes/Zig.sublime-syntax"),
        true,
        Some("Zig.sublime-syntax"),
    )?);
    builder.add(SyntaxDefinition::load_from_str(
        include_str!("syntaxes/Protobuf.sublime-syntax"),
        true,
        Some("Protobuf.sublime-syntax"),
    )?);
    builder.add(SyntaxDefinition::load_from_str(
        include_str!("syntaxes/Kotlin.sublime-syntax"),
        true,
        Some("Kotlin.sublime-syntax"),
    )?);
    builder.add(SyntaxDefinition::load_from_str(
        include_str!("syntaxes/INI.sublime-syntax"),
        true,
        Some("INI.sublime-syntax"),
    )?);
    builder.add(SyntaxDefinition::load_from_str(
        include_str!("syntaxes/HCL.sublime-syntax"),
        true,
        Some("HCL.sublime-syntax"),
    )?);
    builder.add(SyntaxDefinition::load_from_str(
        include_str!("syntaxes/GraphQL.sublime-syntax"),
        true,
        Some("GraphQL.sublime-syntax"),
    )?);
    let output = PathBuf::from(env::var_os("OUT_DIR").ok_or("Cargo OUT_DIR is required")?);
    dump_to_uncompressed_file(&builder.build(), output.join("chilla-syntaxes.packdump"))?;
    Ok(())
}
