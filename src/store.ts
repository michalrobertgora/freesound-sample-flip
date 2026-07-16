/** The app's single store instance, bound to real browser history. */
import { browserUrlAdapter, createAppStore } from "./lib/appStore";

export const store = createAppStore(browserUrlAdapter());
