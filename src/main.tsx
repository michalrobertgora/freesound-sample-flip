import "@fontsource-variable/fraunces";
import "@fontsource-variable/sono";
import { render } from "preact";
import { App } from "./app";
import "./style.css";

render(<App />, document.getElementById("app")!);
