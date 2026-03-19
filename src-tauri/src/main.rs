#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use marky_lib::cli::{parse_cli, CliParseOutcome};

fn main() {
    match parse_cli(std::env::args_os()) {
        Ok(CliParseOutcome::Run(startup_path)) => {
            if let Err(error) = marky_lib::run(startup_path) {
                eprintln!("{error}");
                std::process::exit(1);
            }
        }
        Ok(CliParseOutcome::Help(help_text)) => {
            println!("{help_text}");
        }
        Ok(CliParseOutcome::Version(version_text)) => {
            println!("{version_text}");
        }
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(error.exit_code());
        }
    }
}
