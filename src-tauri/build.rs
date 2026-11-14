use std::{env, error::Error, path::PathBuf};

use syntect::{
    dumps::dump_to_uncompressed_file,
    parsing::{SyntaxDefinition, SyntaxSet},
};

fn main() -> Result<(), Box<dyn Error>> {
    tauri_build::build();
    println!("cargo:rerun-if-changed=syntaxes/TOML.sublime-syntax");

    // Link the complete grammar set once during the build. The embedded artifact
    // keeps lazy syntax loading at runtime, including cross-language contexts.
    let mut builder = SyntaxSet::load_defaults_newlines().into_builder();
    builder.add(SyntaxDefinition::load_from_str(
        include_str!("syntaxes/TOML.sublime-syntax"),
        true,
        Some("TOML.sublime-syntax"),
    )?);
    let output = PathBuf::from(env::var_os("OUT_DIR").ok_or("Cargo OUT_DIR is required")?);
    dump_to_uncompressed_file(&builder.build(), output.join("chilla-syntaxes.packdump"))?;
    Ok(())
}
