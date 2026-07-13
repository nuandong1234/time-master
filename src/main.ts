import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import "./style.css";
import { error as logError, warn as logWarn } from "@tauri-apps/plugin-log";

// 将前端 console.error / console.warn 转发到 Rust 日志文件
const origError = console.error;
console.error = (...args: unknown[]) => {
  origError.apply(console, args);
  const msg = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  logError(msg).catch(() => {});
};

const origWarn = console.warn;
console.warn = (...args: unknown[]) => {
  origWarn.apply(console, args);
  const msg = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  logWarn(msg).catch(() => {});
};

const app = createApp(App);
app.use(router);
app.mount("#app");