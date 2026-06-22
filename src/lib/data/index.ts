// Repository barrel. UI-first: re-exports the mock implementation.
// P3 swaps this to Supabase-backed implementations behind the same signatures
// (e.g. `export * from process.env.NEXT_PUBLIC_DATA === "supabase" ? "./supabase" : "./mock"`).
export * from "./mock";
