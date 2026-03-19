{

  description = "A Tauri + Bun Markdown workbench";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/release-24.11";
    nixpkgs-unstable.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    fenix = {
      url = "github:nix-community/fenix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    crane = {
      url = "github:ipetkov/crane/v0.17.3";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      nixpkgs-unstable,
      flake-utils,
      fenix,
      crane,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        overlays = [ fenix.overlays.default ];
        pkgs = import nixpkgs { inherit system overlays; };
        pkgs-unstable = import nixpkgs-unstable { inherit system; };

        rust-components = fenix.packages.${system}.fromToolchainFile {
          file = ./rust-toolchain.toml;
          sha256 = "sha256-sqSWJDUxc+zaz1nBWMAJKTAGBuGWP25GCftIOlCEAtA=";
        };

        craneLib = (crane.mkLib pkgs).overrideToolchain rust-components;

        linuxGuiLibraries = with pkgs; [
          atk
          cairo
          gdk-pixbuf
          glib
          gtk3
          libsoup_3
          pango
          webkitgtk_4_1
        ];

        linuxRuntimeLibraryPath = pkgs.lib.makeLibraryPath linuxGuiLibraries;

        # Common build inputs
        commonBuildInputs = with pkgs; [
          openssl
          pkg-config
        ]
        ++ pkgs.lib.optionals pkgs.stdenv.isLinux linuxGuiLibraries
        ++ pkgs.lib.optionals pkgs.stdenv.isDarwin [
          darwin.apple_sdk.frameworks.Security
          darwin.apple_sdk.frameworks.SystemConfiguration
        ];

        # Build the crate
        marky-crate = craneLib.buildPackage {
          pname = "marky";
          version = "0.1.0";
          src = craneLib.cleanCargoSource ./.;
          cargoExtraArgs = "--manifest-path src-tauri/Cargo.toml";
          buildInputs = commonBuildInputs;
          nativeBuildInputs = with pkgs; [ pkg-config ];
        };

        devPackages = with pkgs; [
          bun
          cargo-nextest
          fd
          nodejs
          gnused
          rust-components
          rust-analyzer
          netcat-gnu
          pkgs-unstable.docker
          openssl
          pkg-config
          taplo
          gh
          go-task
        ];

      in
      {
        checks = {
          inherit marky-crate;

          clippy = craneLib.cargoClippy {
            pname = "marky-clippy";
            version = "0.1.0";
            src = craneLib.cleanCargoSource ./.;
            cargoExtraArgs = "--manifest-path src-tauri/Cargo.toml";
            buildInputs = commonBuildInputs;
            nativeBuildInputs = with pkgs; [ pkg-config ];
            cargoClippyExtraArgs = "--manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings";
          };

          fmt = craneLib.cargoFmt {
            pname = "marky-fmt";
            version = "0.1.0";
            src = craneLib.cleanCargoSource ./.;
            cargoFmtExtraArgs = "--manifest-path src-tauri/Cargo.toml";
          };
        };

        packages = {
          default = marky-crate;
          marky = marky-crate;
        };

        apps = {
          default = {
            type = "app";
            program = "${marky-crate}/bin/marky";
          };
        };

        devShells.default = craneLib.devShell {
          packages = devPackages;
          buildInputs = commonBuildInputs;

          shellHook = ''
            export LD_LIBRARY_PATH="${pkgs.lib.optionalString pkgs.stdenv.isLinux "${linuxRuntimeLibraryPath}:$LD_LIBRARY_PATH"}"
            echo "Rust development environment ready"
            echo "Rust version: $(rustc --version)"
            echo "Cargo version: $(cargo --version)"
            echo "Task version: $(task --version 2>/dev/null || echo 'not available')"
          '';
        };
      }
    );
}
