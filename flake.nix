{

  description = "A Rust project";

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
          sha256 = pkgs.lib.fakeSha256;
        };

        craneLib = (crane.mkLib pkgs).overrideToolchain rust-components;

        # Common build inputs
        commonBuildInputs = with pkgs; [
          openssl
          pkg-config
        ] ++ pkgs.lib.optionals pkgs.stdenv.isDarwin [
          darwin.apple_sdk.frameworks.Security
          darwin.apple_sdk.frameworks.SystemConfiguration
        ];

        # Build the crate
        marky-crate = craneLib.buildPackage {
          pname = "marky";
          version = "0.1.0";
          src = craneLib.cleanCargoSource ./.;
          buildInputs = commonBuildInputs;
          nativeBuildInputs = with pkgs; [ pkg-config ];
        };

        devPackages = with pkgs; [
          fd
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
            buildInputs = commonBuildInputs;
            nativeBuildInputs = with pkgs; [ pkg-config ];
            cargoClippyExtraArgs = "--all-targets -- -D warnings";
          };

          fmt = craneLib.cargoFmt {
            pname = "marky-fmt";
            version = "0.1.0";
            src = craneLib.cleanCargoSource ./.;
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
          checks = self.checks.${system};
          packages = devPackages;
          buildInputs = commonBuildInputs;

          shellHook = ''
            echo "Rust development environment ready"
            echo "Rust version: $(rustc --version)"
            echo "Cargo version: $(cargo --version)"
            echo "Task version: $(task --version 2>/dev/null || echo 'not available')"
          '';
        };
      }
    );
}
