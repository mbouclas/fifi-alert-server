module.exports = {
  name: "comment-classifier-server", // Name of your application
  script: "src/main.ts", // The npm script to run
  interpreter: "bun", // Bun interpreter
  env: {
    PATH: `${process.env.HOME}/.bun/bin:${process.env.PATH}`, // Add "~/.bun/bin/bun" to PATH
  }
};