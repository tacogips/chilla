import { createEffect, on } from "solid-js";
import { lineStartToOffset } from "../workspace/state";

interface EditorPaneProps {
  readonly fileName: string;
  readonly sourceText: string;
  readonly isDirty: boolean;
  readonly requestedLineStart: number | null;
  readonly onInput: (nextValue: string) => void;
  readonly onSave: () => void;
}

export function EditorPane(props: EditorPaneProps) {
  let textareaRef: HTMLTextAreaElement | undefined;

  createEffect(
    on(
      () => props.requestedLineStart,
      (lineStart) => {
        const textarea = textareaRef;

        if (textarea === undefined || lineStart === null) {
          return;
        }

        const nextOffset = lineStartToOffset(props.sourceText, lineStart);
        textarea.focus();
        textarea.setSelectionRange(nextOffset, nextOffset);

        const style = window.getComputedStyle(textarea);
        const lineHeight = Number.parseFloat(style.lineHeight || "20");
        textarea.scrollTop = Math.max(0, (lineStart - 2) * lineHeight);
      },
    ),
  );

  return (
    <section class="pane editor">
      <header class="pane__header">
        <span class="pane__title">Editor</span>
        <span>
          {props.isDirty ? `${props.fileName} • modified` : props.fileName}
        </span>
      </header>
      <div class="pane__body">
        <textarea
          ref={textareaRef}
          class="editor__textarea"
          spellcheck={false}
          value={props.sourceText}
          onInput={(event) => props.onInput(event.currentTarget.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "s") {
              event.preventDefault();
              props.onSave();
            }
          }}
        />
      </div>
    </section>
  );
}
