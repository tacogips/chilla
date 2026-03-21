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
    bun2nix.url = "github:nix-community/bun2nix?tag=2.0.0";
  };

  outputs =
    {
      self,
      nixpkgs,
      nixpkgs-unstable,
      flake-utils,
      fenix,
      crane,
      bun2nix,
    }:
    let
      perSystem = flake-utils.lib.eachDefaultSystem (
        system:
        let
          overlays = [ fenix.overlays.default ];
          pkgs = import nixpkgs { inherit system overlays; };
          pkgs-unstable = import nixpkgs-unstable { inherit system; };
          lib = pkgs.lib;
          bun = pkgs-unstable.bun;

          rust-components = fenix.packages.${system}.fromToolchainFile {
            file = ./rust-toolchain.toml;
            sha256 = "sha256-sqSWJDUxc+zaz1nBWMAJKTAGBuGWP25GCftIOlCEAtA=";
          };

          craneLib = (crane.mkLib pkgs).overrideToolchain rust-components;
          bun2nixPackage = bun2nix.packages.${system}.default;

          cleanedSource = lib.cleanSourceWith {
            src = ./.;
            filter =
              path: type:
              let
                baseName = builtins.baseNameOf path;
                excludedDirectories = [ ".direnv" ".git" "dist" "node_modules" "result" "target" ];
                excludedFiles = [ "bun.lockb" ];
              in
              !(
                (type == "directory" && builtins.elem baseName excludedDirectories)
                || (type == "regular" && builtins.elem baseName excludedFiles)
              );
          };

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

          linuxRuntimeLibraryPath = lib.makeLibraryPath linuxGuiLibraries;
          linuxGioModulePath = lib.makeSearchPath "lib/gio/modules" (with pkgs; [
            dconf.lib
            glib-networking
          ]);
          linuxXdgDataDirs = lib.concatStringsSep ":" (with pkgs; [
            "${gsettings-desktop-schemas}/share/gsettings-schemas/${gsettings-desktop-schemas.name}"
            "${gtk3}/share/gsettings-schemas/${gtk3.name}"
            "${shared-mime-info}/share"
            "${hicolor-icon-theme}/share"
          ]);

          commonBuildInputs = with pkgs; [
            openssl
            pkg-config
          ]
          ++ lib.optionals pkgs.stdenv.isLinux linuxGuiLibraries
          ++ lib.optionals pkgs.stdenv.isDarwin [
            darwin.apple_sdk.frameworks.Security
            darwin.apple_sdk.frameworks.SystemConfiguration
          ];

          frontendDist = pkgs.stdenvNoCC.mkDerivation {
            pname = "marky-frontend";
            version = "0.1.0";
            src = cleanedSource;
            dontRunLifecycleScripts = true;
            dontUseBunPatch = true;

            nativeBuildInputs = [
              bun
              bun2nixPackage.hook
            ];

            bunDeps = bun2nixPackage.fetchBunDeps {
              bunNix = ./bun.nix;
            };
            bunInstallFlagsArray = [ "--frozen-lockfile" ];

            patchPhase = ''
              runHook prePatch
              export HOME=$(mktemp -d)
              runHook postPatch
            '';

            buildPhase = ''
              runHook preBuild
              bun run build
              runHook postBuild
            '';

            installPhase = ''
              mkdir -p $out
              cp -R dist/. $out/
            '';
          };

          tauriBuildSource = pkgs.runCommand "marky-tauri-source" { } ''
            cp -R ${cleanedSource} $out
            chmod -R u+w $out
            mkdir -p $out/dist
            cp -R ${frontendDist}/. $out/dist/
          '';

          cargoArtifacts = craneLib.buildDepsOnly {
            pname = "marky-artifacts";
            version = "0.1.0";
            src = tauriBuildSource;
            cargoExtraArgs = "--manifest-path src-tauri/Cargo.toml";
            buildInputs = commonBuildInputs;
            nativeBuildInputs = with pkgs; [ pkg-config ];
          };

          marky = craneLib.buildPackage {
            pname = "marky";
            version = "0.1.0";
            src = tauriBuildSource;
            inherit cargoArtifacts;
            cargoExtraArgs = "--manifest-path src-tauri/Cargo.toml";
            buildInputs = commonBuildInputs;
            nativeBuildInputs = with pkgs; [
              makeWrapper
              pkg-config
            ];

            postFixup = lib.optionalString pkgs.stdenv.isLinux ''
              wrapProgram $out/bin/marky \
                --prefix LD_LIBRARY_PATH : "${linuxRuntimeLibraryPath}"
            '';
          };

          devPackages = with pkgs; [
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
          ]
          ++ [ bun ];
        in
        {
          checks = {
            inherit frontendDist marky;

            clippy = craneLib.cargoClippy {
              pname = "marky-clippy";
              version = "0.1.0";
              src = tauriBuildSource;
              inherit cargoArtifacts;
              cargoExtraArgs = "--manifest-path src-tauri/Cargo.toml";
              buildInputs = commonBuildInputs;
              nativeBuildInputs = with pkgs; [ pkg-config ];
              cargoClippyExtraArgs = "--manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings";
            };

            fmt = craneLib.cargoFmt {
              pname = "marky-fmt";
              version = "0.1.0";
              src = tauriBuildSource;
              cargoFmtExtraArgs = "--manifest-path src-tauri/Cargo.toml";
            };
          };

          packages = {
            default = marky;
            marky = marky;
            frontend = frontendDist;
          };

          apps = {
            default = {
              type = "app";
              program = lib.getExe marky;
            };
          };

          devShells.default = craneLib.devShell {
            packages = devPackages;
            buildInputs = commonBuildInputs;

            shellHook = ''
              export LD_LIBRARY_PATH="${lib.optionalString pkgs.stdenv.isLinux "${linuxRuntimeLibraryPath}:$LD_LIBRARY_PATH"}"
              ${lib.optionalString pkgs.stdenv.isLinux ''
                # Avoid mixing host GTK/GIO modules with the shell's GLib runtime.
                export GIO_EXTRA_MODULES="${linuxGioModulePath}"
                export XDG_DATA_DIRS="${linuxXdgDataDirs}"
                export WEBKIT_DISABLE_DMABUF_RENDERER=1
                unset GTK_PATH
                unset GI_TYPELIB_PATH
                unset GTK_IM_MODULE
                unset QT_IM_MODULE
                unset XMODIFIERS
              ''}
              echo "Rust development environment ready"
              echo "Rust version: $(rustc --version)"
              echo "Cargo version: $(cargo --version)"
              echo "Task version: $(task --version 2>/dev/null || echo 'not available')"
            '';
          };
        }
      );
    in
    perSystem
    // {
      overlays.default = final: _prev: {
        marky = self.packages.${final.system}.default;
      };
    };
}
