//! marky - A Rust project
//!
//! This crate provides the core functionality for the marky project.

/// A placeholder function that returns a greeting message.
///
/// # Examples
///
/// ```
/// use marky::hello;
/// assert_eq!(hello(), "Hello from marky!");
/// ```
pub fn hello() -> &'static str {
    "Hello from marky!"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hello() {
        assert_eq!(hello(), "Hello from marky!");
    }
}
