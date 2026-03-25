cask "chilla" do
  version "0.1.1"
  sha256 "be3aacbaf73e4d4461c4f279641fcd54f555b0a0a005ae5efec3e8cab055cb49"

  url "https://github.com/tacogips/chilla/releases/download/v#{version}/chilla-v#{version}-aarch64-darwin.tar.gz",
      verified: "github.com/tacogips/chilla/releases/download/"
  name "chilla"
  desc "Markdown viewer and file browser"
  homepage "https://github.com/tacogips/chilla"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on arch: :arm64

  binary "chilla-v#{version}-aarch64-darwin/bin/chilla", target: "chilla"

  caveats do
    <<~EOS
      This cask installs the current Nix-built release artifact.

      The packaged binary is not a fully self-contained .app bundle and may depend on
      /nix/store runtime libraries. It has been verified on a Nix-enabled Apple Silicon Mac.
    EOS
  end
end
