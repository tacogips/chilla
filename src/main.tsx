/* @refresh reload */
import { render } from "solid-js/web";
import App from "./app/App";
import { initColorScheme, syncSyntaxUiThemeToBackend } from "./lib/theme";

initColorScheme();
void syncSyntaxUiThemeToBackend();

render(() => <App />, document.getElementById("root") as HTMLElement);
