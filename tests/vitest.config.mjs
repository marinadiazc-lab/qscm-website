import path from "node:path";

export default {
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, ".."),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
};
