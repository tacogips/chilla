# Async Programming Patterns

Best practices for asynchronous Rust using tokio and async/await.

## Async Fundamentals

### Function Signatures

```rust
// Async function - returns impl Future
async fn fetch_user(id: UserId) -> Result<User, Error> {
    // ...
}

// Equivalent desugared form
fn fetch_user(id: UserId) -> impl Future<Output = Result<User, Error>> {
    async move {
        // ...
    }
}

// Trait with async methods (use async-trait crate)
#[async_trait]
pub trait UserRepository {
    async fn find(&self, id: UserId) -> Result<User, Error>;
    async fn save(&self, user: &User) -> Result<(), Error>;
}
```

### Runtime Setup

```rust
// Simple binary
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config = load_config()?;
    run_server(config).await
}

// With custom runtime configuration
#[tokio::main(flavor = "multi_thread", worker_threads = 4)]
async fn main() -> anyhow::Result<()> {
    // ...
}

// Current-thread runtime (for tests or simple CLIs)
#[tokio::main(flavor = "current_thread")]
async fn main() -> anyhow::Result<()> {
    // ...
}

// Manual runtime creation
fn main() -> anyhow::Result<()> {
    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(4)
        .enable_all()
        .build()?;

    rt.block_on(async {
        run_server().await
    })
}
```

## Concurrent Execution

### join! for Multiple Futures

```rust
use tokio::join;

async fn load_dashboard(user_id: UserId) -> Result<Dashboard, Error> {
    // Run all three concurrently
    let (user, orders, notifications) = join!(
        fetch_user(user_id.clone()),
        fetch_orders(user_id.clone()),
        fetch_notifications(user_id),
    );

    Ok(Dashboard {
        user: user?,
        orders: orders?,
        notifications: notifications?,
    })
}
```

### try_join! for Fallible Futures

```rust
use tokio::try_join;

async fn load_dashboard(user_id: UserId) -> Result<Dashboard, Error> {
    // Returns early on first error
    let (user, orders, notifications) = try_join!(
        fetch_user(user_id.clone()),
        fetch_orders(user_id.clone()),
        fetch_notifications(user_id),
    )?;

    Ok(Dashboard { user, orders, notifications })
}
```

### select! for Racing Futures

```rust
use tokio::select;

async fn fetch_with_timeout(id: UserId) -> Result<User, Error> {
    select! {
        result = fetch_user(id) => result,
        _ = tokio::time::sleep(Duration::from_secs(5)) => {
            Err(Error::Timeout)
        }
    }
}

// With cancellation
async fn cancellable_work(cancel: CancellationToken) -> Result<(), Error> {
    loop {
        select! {
            _ = cancel.cancelled() => {
                tracing::info!("Work cancelled");
                return Ok(());
            }
            result = do_work() => {
                result?;
            }
        }
    }
}
```

## Task Spawning

### Background Tasks

```rust
use tokio::task::JoinHandle;

// Spawn independent task
fn spawn_processor(rx: Receiver<Job>) -> JoinHandle<()> {
    tokio::spawn(async move {
        while let Some(job) = rx.recv().await {
            if let Err(e) = process_job(job).await {
                tracing::error!("Job failed: {e}");
            }
        }
    })
}

// Await spawned task
let handle = tokio::spawn(async {
    heavy_computation().await
});
let result = handle.await?; // Returns Result<T, JoinError>
```

### Blocking Operations

```rust
// WRONG: Blocking in async context
async fn bad_read_file(path: &str) -> std::io::Result<String> {
    std::fs::read_to_string(path) // Blocks the async runtime!
}

// CORRECT: Use spawn_blocking for CPU-bound or blocking I/O
async fn read_file(path: String) -> std::io::Result<String> {
    tokio::task::spawn_blocking(move || {
        std::fs::read_to_string(&path)
    }).await?
}

// BETTER: Use tokio's async I/O
async fn read_file(path: &str) -> std::io::Result<String> {
    tokio::fs::read_to_string(path).await
}
```

## Channels

### mpsc (Multi-Producer, Single-Consumer)

```rust
use tokio::sync::mpsc;

async fn producer_consumer() {
    let (tx, mut rx) = mpsc::channel::<Job>(100);

    // Producer
    let producer = tokio::spawn(async move {
        for i in 0..10 {
            tx.send(Job::new(i)).await.unwrap();
        }
    });

    // Consumer
    let consumer = tokio::spawn(async move {
        while let Some(job) = rx.recv().await {
            process(job).await;
        }
    });

    let _ = tokio::join!(producer, consumer);
}
```

### oneshot (Single-Value Response)

```rust
use tokio::sync::oneshot;

struct Request {
    data: String,
    response_tx: oneshot::Sender<Response>,
}

async fn handle_request(req: Request) {
    let response = process(req.data).await;
    let _ = req.response_tx.send(response);
}

async fn make_request(tx: mpsc::Sender<Request>) -> Response {
    let (response_tx, response_rx) = oneshot::channel();
    tx.send(Request {
        data: "hello".into(),
        response_tx,
    }).await.unwrap();

    response_rx.await.unwrap()
}
```

### broadcast (Multi-Consumer)

```rust
use tokio::sync::broadcast;

async fn event_bus() {
    let (tx, _) = broadcast::channel::<Event>(100);

    // Multiple subscribers
    let mut rx1 = tx.subscribe();
    let mut rx2 = tx.subscribe();

    tokio::spawn(async move {
        while let Ok(event) = rx1.recv().await {
            handle_event_1(event).await;
        }
    });

    tokio::spawn(async move {
        while let Ok(event) = rx2.recv().await {
            handle_event_2(event).await;
        }
    });

    // Publish events
    tx.send(Event::UserCreated { id: 1 })?;
}
```

### watch (Latest-Value)

```rust
use tokio::sync::watch;

async fn config_watcher() {
    let (tx, rx) = watch::channel(Config::default());

    // Readers get the latest value
    let mut rx1 = rx.clone();
    tokio::spawn(async move {
        loop {
            rx1.changed().await.unwrap();
            let config = rx1.borrow();
            apply_config(&*config);
        }
    });

    // Update config
    tx.send(load_new_config())?;
}
```

## Timeouts and Cancellation

### Timeouts

```rust
use tokio::time::{timeout, Duration};

async fn with_timeout() -> Result<Data, Error> {
    match timeout(Duration::from_secs(5), fetch_data()).await {
        Ok(result) => result,
        Err(_) => Err(Error::Timeout),
    }
}

// Or using the ? operator
async fn with_timeout() -> Result<Data, Error> {
    timeout(Duration::from_secs(5), fetch_data())
        .await
        .map_err(|_| Error::Timeout)?
}
```

### Cancellation Tokens

```rust
use tokio_util::sync::CancellationToken;

struct Worker {
    cancel: CancellationToken,
}

impl Worker {
    fn new() -> Self {
        Self {
            cancel: CancellationToken::new(),
        }
    }

    async fn run(&self) {
        loop {
            select! {
                _ = self.cancel.cancelled() => {
                    tracing::info!("Worker shutting down");
                    break;
                }
                _ = self.do_work() => {}
            }
        }
    }

    fn stop(&self) {
        self.cancel.cancel();
    }
}
```

## Graceful Shutdown

```rust
use tokio::signal;

async fn run_server() -> anyhow::Result<()> {
    let server = create_server();
    let cancel = CancellationToken::new();
    let cancel_clone = cancel.clone();

    // Shutdown signal handler
    tokio::spawn(async move {
        signal::ctrl_c().await.expect("Failed to listen for Ctrl+C");
        tracing::info!("Shutdown signal received");
        cancel_clone.cancel();
    });

    // Run server until cancelled
    select! {
        result = server.run() => result,
        _ = cancel.cancelled() => {
            tracing::info!("Initiating graceful shutdown");
            server.shutdown().await;
            Ok(())
        }
    }
}
```

## Async Streams

```rust
use tokio_stream::{Stream, StreamExt};
use async_stream::stream;

// Create async stream
fn fetch_pages(url: &str) -> impl Stream<Item = Result<Page, Error>> {
    stream! {
        let mut page = 1;
        loop {
            match fetch_page(url, page).await {
                Ok(data) if data.is_empty() => break,
                Ok(data) => yield Ok(data),
                Err(e) => {
                    yield Err(e);
                    break;
                }
            }
            page += 1;
        }
    }
}

// Consume stream
async fn process_all_pages() -> Result<(), Error> {
    let mut stream = std::pin::pin!(fetch_pages("https://api.example.com"));

    while let Some(result) = stream.next().await {
        let page = result?;
        process_page(page).await?;
    }

    Ok(())
}
```

## Error Handling in Async

```rust
// Propagate errors with ?
async fn process() -> Result<(), Error> {
    let data = fetch_data().await?;
    transform(data).await?;
    save_result().await?;
    Ok(())
}

// Handle errors at spawn boundary
tokio::spawn(async move {
    if let Err(e) = process().await {
        tracing::error!("Process failed: {e}");
    }
});

// Collect results from multiple tasks
let handles: Vec<_> = items
    .into_iter()
    .map(|item| tokio::spawn(process_item(item)))
    .collect();

let results: Vec<Result<_, _>> = futures::future::join_all(handles).await;
for result in results {
    match result {
        Ok(Ok(_)) => { /* Success */ }
        Ok(Err(e)) => tracing::error!("Task error: {e}"),
        Err(e) => tracing::error!("Join error: {e}"),
    }
}
```

## Anti-Patterns to Avoid

```rust
// BAD: Blocking in async
async fn bad() {
    std::thread::sleep(Duration::from_secs(1)); // Blocks runtime!
}

// GOOD: Use async sleep
async fn good() {
    tokio::time::sleep(Duration::from_secs(1)).await;
}

// BAD: Sync mutex in async
use std::sync::Mutex;
async fn bad(data: Arc<Mutex<Data>>) {
    let guard = data.lock().unwrap(); // Can cause deadlocks
    // ... await point while holding lock ...
}

// GOOD: Use tokio::sync::Mutex for async
use tokio::sync::Mutex;
async fn good(data: Arc<Mutex<Data>>) {
    let guard = data.lock().await;
    // Safe to await while holding lock
}

// BAD: Spawning without tracking
for item in items {
    tokio::spawn(process(item)); // Fire and forget
}

// GOOD: Track spawned tasks
let handles: Vec<_> = items
    .into_iter()
    .map(|item| tokio::spawn(process(item)))
    .collect();
for handle in handles {
    handle.await?;
}

// BAD: Unbounded channels with fast producers
let (tx, rx) = mpsc::unbounded_channel();

// GOOD: Bounded channels with backpressure
let (tx, rx) = mpsc::channel(100);
```

## References

- [Tokio Tutorial](https://tokio.rs/tokio/tutorial)
- [Async Book](https://rust-lang.github.io/async-book/)
- [Tokio Best Practices](https://tokio.rs/tokio/topics/bridging)
- [Alice Ryhl's Blog](https://ryhl.io/) - Excellent async Rust articles
