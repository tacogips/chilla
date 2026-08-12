#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::time::Instant;

use chilla_lib::{
    cli::{normalize_cli, parse_normalized_cli, CliNormalizationOutcome, CliParseOutcome},
    verbose_log::{self, VerboseInit},
};

fn main() {
    let process_started_at = Instant::now();
    match normalize_cli(std::env::args_os()) {
        CliNormalizationOutcome::Information(outcome) => print_information(outcome),
        CliNormalizationOutcome::Parse(input) => {
            let verbose = input.options.verbose;
            verbose_log::initialize(VerboseInit {
                enabled: verbose,
                process_started_at,
            });
            if verbose {
                verbose_log::record_phase("process_start", process_started_at, "success");
            }

            match parse_normalized_cli(input) {
                Ok(CliParseOutcome::Run(startup_target)) => {
                    verbose_log::record_phase("cli_parse", process_started_at, "success");
                    verbose_log::arm_startup_load(&startup_target);
                    if let Err(error) = chilla_lib::run(startup_target) {
                        verbose_log::record_phase_message(
                            "application_run",
                            process_started_at,
                            "failure",
                            &error,
                        );
                        verbose_log::shutdown();
                        eprintln!("{error}");
                        std::process::exit(1);
                    }
                    verbose_log::shutdown();
                }
                Ok(outcome @ (CliParseOutcome::Help(_) | CliParseOutcome::Version(_))) => {
                    print_information(outcome);
                }
                Err(error) => {
                    verbose_log::record_app_error("cli_parse", None, process_started_at, &error);
                    verbose_log::shutdown();
                    eprintln!("{error}");
                    std::process::exit(error.exit_code());
                }
            }
        }
    }
}

fn print_information(outcome: CliParseOutcome) {
    match outcome {
        CliParseOutcome::Help(help_text) => {
            println!("{help_text}");
        }
        CliParseOutcome::Version(version_text) => {
            println!("{version_text}");
        }
        CliParseOutcome::Run(_) => {}
    }
}
