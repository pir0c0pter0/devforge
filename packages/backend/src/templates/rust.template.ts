import { ContainerTemplate } from './types';

/**
 * Rust development template
 * Pre-configured for Rust development with cargo, rust-analyzer, and common tooling
 */
export const rustTemplate: ContainerTemplate = {
  id: 'rust',
  name: 'Rust',
  description: 'Rust development environment with cargo, rust-analyzer LSP, clippy, and common tooling.',
  icon: 'rust',
  category: 'language',
  tags: ['rust', 'cargo', 'systems', 'backend', 'wasm', 'cli'],
  defaultConfig: {
    image: 'claude-docker/both:latest',
    environment: {
      CARGO_HOME: '/home/developer/.cargo',
      RUSTUP_HOME: '/home/developer/.rustup',
      PATH: '/home/developer/.cargo/bin:$PATH',
      RUST_BACKTRACE: '1',
      CARGO_TERM_COLOR: 'always',
    },
    extensions: [
      'rust-lang.rust-analyzer',
      'tamasfe.even-better-toml',
      'serayuzgur.crates',
      'vadimcn.vscode-lldb',
      'fill-labs.dependi',
    ],
    postCreateCommands: [
      // Verify Rust installation
      'rustc --version && cargo --version',
      // Update Rust toolchain
      'rustup update stable',
      // Install useful Rust components
      'rustup component add rustfmt clippy rust-src',
      // Install useful cargo tools
      'cargo install cargo-watch',
      'cargo install cargo-edit',
      'cargo install cargo-expand',
      'cargo install cargo-audit',
      'cargo install cargo-outdated',
      'cargo install cargo-criterion',
      // Install cross-compilation support (optional, for WebAssembly)
      'rustup target add wasm32-unknown-unknown || true',
      // Initialize a Cargo project if not exists
      'cd /workspace && [ ! -f Cargo.toml ] && cargo init --name project || true',
    ],
    workingDir: '/workspace',
    ports: {
      8080: 0,  // code-server - dynamic port allocation
      3000: 0,  // dev server - dynamic port allocation
    },
    resources: {
      cpuLimit: 4,
      memoryLimit: 8192,
      diskLimit: 30720,
    },
  },
  requiredEnvVars: [
    {
      name: 'ANTHROPIC_API_KEY',
      description: 'Anthropic API key for Claude Code (optional if using browser auth)',
      required: false,
      isSecret: true,
    },
  ],
};

export default rustTemplate;
