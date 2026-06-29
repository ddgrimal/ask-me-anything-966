import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
  ConversationEmptyState,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import ragLogo from "@/assets/rag-logo.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RAG Chat — MVP" },
      { name: "description", content: "Interfaz de pruebas para tu API RAG local." },
    ],
  }),
  component: ChatPage,
});

const API_URL =
  (typeof window !== "undefined" && (window as { __RAG_API__?: string }).__RAG_API__) ||
  "http://localhost:8000/api/chat";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Keep textarea focused
  useEffect(() => {
    const t = document.querySelector<HTMLTextAreaElement>('textarea[data-prompt-input]');
    textareaRef.current = t;
    t?.focus();
  }, []);

  useEffect(() => {
    if (!pending) textareaRef.current?.focus();
  }, [pending, messages.length]);

  async function handleSubmit(msg: PromptInputMessage) {
    const text = msg.text?.trim();
    if (!text || pending) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text,
    };
    setMessages((m) => [...m, userMsg]);
    setPending(true);

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = (await res.json()) as { answer?: string; response?: string; error?: string };
      const answer = data.answer ?? data.response ?? data.error ?? "(respuesta vacía)";

      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "assistant", text: answer },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      toast.error("No se pudo conectar con la API", {
        description: `${API_URL} — ${message}`,
      });
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: `⚠️ Error al contactar con la API (\`${API_URL}\`): ${message}`,
        },
      ]);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Toaster richColors position="top-center" />

      <header className="border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <img
            src={ragLogo}
            alt="RAG"
            width={32}
            height={32}
            className="h-8 w-8 rounded-md object-contain"
          />
          <div className="flex flex-col">
            <h1 className="text-sm font-semibold leading-tight text-foreground">
              RAG Playground
            </h1>
            <p className="text-xs text-muted-foreground">
              MVP · <code className="font-mono">{API_URL}</code>
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4">
        <Conversation className="flex-1">
          <ConversationContent className="space-y-2">
            {messages.length === 0 ? (
              <ConversationEmptyState
                icon={
                  <img
                    src={ragLogo}
                    alt=""
                    width={48}
                    height={48}
                    className="h-12 w-12 rounded-lg object-contain"
                  />
                }
                title="Pregúntale a tu RAG"
                description="Envía una pregunta y se enviará a tu endpoint local para obtener la respuesta."
              />
            ) : (
              messages.map((m) =>
                m.role === "user" ? (
                  <Message key={m.id} from="user">
                    <MessageContent>{m.text}</MessageContent>
                  </Message>
                ) : (
                  <Message key={m.id} from="assistant">
                    <MessageContent variant="flat">
                      <MessageResponse>{m.text}</MessageResponse>
                    </MessageContent>
                  </Message>
                ),
              )
            )}
            {pending && (
              <Message from="assistant">
                <MessageContent variant="flat">
                  <Shimmer>Pensando…</Shimmer>
                </MessageContent>
              </Message>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="sticky bottom-0 pb-4 pt-2">
          <PromptInput onSubmit={handleSubmit}>
            <PromptInputTextarea
              data-prompt-input
              placeholder="Escribe tu pregunta..."
              disabled={pending}
            />
            <PromptInputFooter className="justify-end">
              <PromptInputSubmit status={pending ? "submitted" : undefined} disabled={pending} />
            </PromptInputFooter>
          </PromptInput>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Asegúrate de que tu API permite CORS desde este origen.
          </p>
        </div>
      </main>
    </div>
  );
}
