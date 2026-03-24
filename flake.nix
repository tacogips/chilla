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

          # WebKitGTK uses GStreamer for <video> / media.
          # Include:
          # - gstreamer itself for coreelements like typefind/fakesink
          # - base/good/bad/ugly/libav for container/codec support
          # - pipewire so autoaudiosink can resolve a compatible pipewiresink
          linuxGStreamerCorePackage = pkgs.gst_all_1.gstreamer.out;

          linuxGStreamerPluginPackages =
            (with pkgs.gst_all_1; [
              gst-plugins-base
              gst-plugins-good
              gst-plugins-bad
              gst-plugins-ugly
              gst-libav
            ])
            ++ [
              linuxGStreamerCorePackage
              pkgs.pipewire
            ];

          linuxGStreamerPluginPath = lib.makeSearchPath "lib/gstreamer-1.0" linuxGStreamerPluginPackages;
          linuxGStreamerPluginScanner =
            "${linuxGStreamerCorePackage}/libexec/gstreamer-1.0/gst-plugin-scanner";

          linuxWebkitMediaLibraries = with pkgs; [
            ffmpeg
            libpulseaudio
            alsa-lib
            pipewire
          ];

          linuxRuntimeLibraryPath =
            if pkgs.stdenv.isLinux then
              lib.makeLibraryPath (
                linuxGuiLibraries
                ++ (with pkgs.gst_all_1; [
                  linuxGStreamerCorePackage
                  gst-plugins-base
                ])
                ++ linuxWebkitMediaLibraries
              )
            else
              lib.makeLibraryPath linuxGuiLibraries;
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
            darwin.apple_sdk.frameworks.AppKit
            darwin.apple_sdk.frameworks.Cocoa
            darwin.apple_sdk.frameworks.CoreFoundation
            darwin.apple_sdk.frameworks.CoreServices
            darwin.apple_sdk.frameworks.Foundation
            darwin.apple_sdk.frameworks.Security
            darwin.apple_sdk.frameworks.SystemConfiguration
            darwin.apple_sdk.frameworks.WebKit
          ];

          frontendBunDeps = bun2nixPackage.fetchBunDeps {
            bunNix = ./bun.nix;
          };

          frontendDist = pkgs.stdenvNoCC.mkDerivation {
            pname = "chilla-frontend";
            version = "0.1.0";
            src = cleanedSource;

            nativeBuildInputs = [
              bun
            ];

            patchPhase = ''
              runHook prePatch
              export HOME=$(mktemp -d)
              export BUN_INSTALL_CACHE_DIR=$(mktemp -d)
              cp -RL ${frontendBunDeps}/share/bun-cache/. "$BUN_INSTALL_CACHE_DIR"
              runHook postPatch
            '';

            buildPhase = ''
              runHook preBuild
              bun install --frozen-lockfile --backend=copyfile --ignore-scripts
              bun run build
              runHook postBuild
            '';

            installPhase = ''
              mkdir -p $out
              cp -R dist/. $out/
            '';
          };

          tauriBuildSource = pkgs.runCommand "chilla-tauri-source" { } ''
            cp -R ${cleanedSource} $out
            chmod -R u+w $out
            mkdir -p $out/dist
            cp -R ${frontendDist}/. $out/dist/
          '';

          cargoArtifacts = craneLib.buildDepsOnly {
            pname = "chilla-artifacts";
            version = "0.1.0";
            src = tauriBuildSource;
            cargoExtraArgs = "--manifest-path src-tauri/Cargo.toml";
            buildInputs = commonBuildInputs;
            nativeBuildInputs = with pkgs; [ pkg-config ];
          };

          chilla = craneLib.buildPackage {
            pname = "chilla";
            version = "0.1.0";
            src = tauriBuildSource;
            inherit cargoArtifacts;
            cargoExtraArgs = "--manifest-path src-tauri/Cargo.toml";
            buildInputs = commonBuildInputs;
            nativeBuildInputs = with pkgs; [
              makeWrapper
              pkg-config
            ];
            preBuild = ''
              # Tauri caches build-script outputs with absolute OUT_DIR paths.
              # When crane reuses cargoArtifacts across derivations, those paths
              # point at the previous sandbox and break permission generation.
              rm -rf target/release/build/tauri-*
              rm -rf target/release/build/tauri-build-*
              rm -rf target/release/build/tauri-plugin-*
              rm -rf target/release/build/tauri-runtime-*
              rm -rf target/release/build/tauri-runtime-wry-*
              rm -rf target/release/build/tauri-utils-*
              rm -rf target/release/build/chilla-*
            '';

            postFixup = lib.optionalString pkgs.stdenv.isLinux ''
              wrapProgram $out/bin/chilla \
                --prefix LD_LIBRARY_PATH : "${linuxRuntimeLibraryPath}" \
                --set GIO_EXTRA_MODULES "${linuxGioModulePath}" \
                --set XDG_DATA_DIRS "${linuxXdgDataDirs}" \
                --set WEBKIT_DISABLE_DMABUF_RENDERER 1 \
                --set GST_PLUGIN_SCANNER "${linuxGStreamerPluginScanner}" \
                --set GST_PLUGIN_SYSTEM_PATH "${linuxGStreamerPluginPath}" \
                --prefix GST_PLUGIN_SYSTEM_PATH_1_0 : "${linuxGStreamerPluginPath}" \
                --set GST_PLUGIN_PATH "${linuxGStreamerPluginPath}" \
                --set GST_PLUGIN_PATH_1_0 "${linuxGStreamerPluginPath}" \
                --unset GTK_PATH \
                --unset GI_TYPELIB_PATH \
                --unset GTK_IM_MODULE \
                --unset GTK_IM_MODULE_FILE \
                --unset QT_IM_MODULE \
                --unset XMODIFIERS \
                --unset GIO_MODULE_DIR \
                --unset GTK_EXE_PREFIX \
                --unset GTK_DATA_PREFIX
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
          ++ lib.optionals pkgs.stdenv.isLinux [
            xorg.xorgserver
          ]
          ++ [ bun ];
        in
        {
          checks = {
            inherit frontendDist chilla;

            clippy = craneLib.cargoClippy {
              pname = "chilla-clippy";
              version = "0.1.0";
              src = tauriBuildSource;
              inherit cargoArtifacts;
              cargoExtraArgs = "--manifest-path src-tauri/Cargo.toml";
              buildInputs = commonBuildInputs;
              nativeBuildInputs = with pkgs; [ pkg-config ];
              cargoClippyExtraArgs = "--manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings";
            };

            fmt = craneLib.cargoFmt {
              pname = "chilla-fmt";
              version = "0.1.0";
              src = tauriBuildSource;
              cargoFmtExtraArgs = "--manifest-path src-tauri/Cargo.toml";
            };
          };

          packages = {
            default = chilla;
            chilla = chilla;
            frontend = frontendDist;
          };

          apps = {
            default = {
              type = "app";
              program = lib.getExe chilla;
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
                export GST_PLUGIN_SCANNER="${linuxGStreamerPluginScanner}"
                export GST_PLUGIN_SYSTEM_PATH="${linuxGStreamerPluginPath}"
                export GST_PLUGIN_SYSTEM_PATH_1_0="${linuxGStreamerPluginPath}"
                # Some builds consult GST_PLUGIN_PATH(_1_0), others GST_PLUGIN_SYSTEM_PATH(_1_0).
                export GST_PLUGIN_PATH="${linuxGStreamerPluginPath}"
                export GST_PLUGIN_PATH_1_0="${linuxGStreamerPluginPath}"
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
        chilla = self.packages.${final.system}.default;
      };
    };
}
