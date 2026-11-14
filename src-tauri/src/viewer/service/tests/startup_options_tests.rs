use std::fs;

use super::{TestDir, ViewerService};
use crate::{
    cli::StartupTarget,
    git_diff::{GitDiffSource, GitDiffTarget},
    github_pr_diff::GitHubPrTarget,
    viewer::types::FileOpenOptions,
};

#[test]
fn startup_context_retains_explicit_options_for_every_target_kind() {
    let test_dir = TestDir::new();
    let first_path = test_dir.path().join("first.txt");
    let second_path = test_dir.path().join("second.txt");
    fs::write(&first_path, "first").expect("write first fixture");
    fs::write(&second_path, "second").expect("write second fixture");
    let directory = test_dir.path().canonicalize().expect("canonical directory");
    let first_file = first_path.canonicalize().expect("canonical first file");
    let second_file = second_path.canonicalize().expect("canonical second file");
    let github_target = GitHubPrTarget::parse("https://github.com/octocat/Hello-World/pull/42")
        .expect("GitHub target");
    let git_diff_target = GitDiffTarget {
        repo_path: directory.display().to_string(),
        source: GitDiffSource::Worktree,
    };

    let targets = vec![
        (StartupTarget::CurrentDirectory(directory.clone()), true),
        (StartupTarget::Directory(directory.clone()), false),
        (StartupTarget::File(first_file.clone()), true),
        (StartupTarget::FileSet(vec![first_file, second_file]), false),
        (StartupTarget::GitHubPr(github_target), true),
        (StartupTarget::GitDiff(git_diff_target), false),
    ];

    for (target, expected) in targets {
        let options = FileOpenOptions {
            csv_first_row_as_header: expected,
        };
        let context = ViewerService::new()
            .startup_context_with_options(&target, options)
            .expect("startup context");
        assert_eq!(context.file_open_options, options, "target: {target:?}");
        assert_eq!(
            serde_json::to_value(context).expect("serialize startup context")["file_open_options"]
                ["csv_first_row_as_header"],
            expected,
            "target: {target:?}"
        );
    }
}
