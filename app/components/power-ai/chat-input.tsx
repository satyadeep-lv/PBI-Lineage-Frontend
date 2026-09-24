import { Send, Square } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { usePowerAiChat } from "~/lib/use-power-ai-chat";
import { usePowerAiStore } from "~/stores/power-ai-store";

export function ChatInput() {
  const [value, setValue] = useState("");
  const loading = usePowerAiStore((state) => state.loading);
  const streaming = usePowerAiStore((state) => state.streaming);
  const pendingQuestion = usePowerAiStore((state) => state.pendingQuestion);
  const { send, cancel } = usePowerAiChat();

  useEffect(() => {
    if (pendingQuestion) setValue(pendingQuestion);
  }, [pendingQuestion]);

  function submit() {
    if (!value.trim() || loading) return;
    void send(value);
    setValue("");
  }

  return (
    <div className="border-t border-border bg-surface p-3">
      <div className="flex items-end gap-2">
        <Textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="Ask Power AI..."
          aria-label="Message Power AI"
          rows={1}
          className="max-h-32 min-h-9 py-2 text-sm"
        />
        {streaming ? (
          <Button type="button" variant="outline" size="icon" aria-label="Stop generating" onClick={cancel}>
            <Square className="size-3.5" />
          </Button>
        ) : (
          <Button type="button" size="icon" aria-label="Send message" disabled={!value.trim() || loading} onClick={submit}>
            <Send className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
