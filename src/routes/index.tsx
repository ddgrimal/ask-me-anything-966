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
import { BookOpen } from "lucide-react";

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
  (import.meta.env.VITE_RAG_API_URL as string | undefined) ??
  "http://localhost:8000/api/chat";

type Citation = { title?: string; url: string };

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  citations?: Citation[];
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
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ question: text }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const contentType = res.headers.get("content-type") ?? "";
      const assistantId = crypto.randomUUID();

      if (contentType.includes("text/event-stream") || contentType.includes("stream")) {
        setMessages((m) => [...m, { id: assistantId, role: "assistant", text: "" }]);

        const reader = res.body?.getReader();
        if (!reader) throw new Error("Sin body en la respuesta");
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulated = "";
        let citations: Citation[] | undefined;

        const flush = () => {
          setMessages((m) =>
            m.map((msg) =>
              msg.id === assistantId ? { ...msg, text: accumulated, citations } : msg,
            ),
          );
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const obj = JSON.parse(payload);
              const chunk =
                obj.text ?? obj.delta ?? obj.content ?? obj.answer ?? obj.response ?? "";
              if (typeof chunk === "string" && chunk) {
                // Si llega el texto completo en un único evento, reemplazamos
                accumulated = accumulated && chunk.startsWith(accumulated) ? chunk : accumulated + chunk;
              }
              if (Array.isArray(obj.citations)) citations = obj.citations as Citation[];
              flush();
            } catch {
              // línea no-JSON, ignorar
            }
          }
        }
      } else {
        const data = (await res.json()) as {
          text?: string;
          answer?: string;
          response?: string;
          error?: string;
          citations?: Citation[];
        };
        const answer = data.text ?? data.answer ?? data.response ?? data.error ?? "(respuesta vacía)";
        setMessages((m) => [
          ...m,
          { id: assistantId, role: "assistant", text: answer, citations: data.citations },
        ]);
      }
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
                    <div className="w-full max-w-full overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                      <div className="px-5 py-4 text-[15px] leading-relaxed text-card-foreground [&_code]:whitespace-pre-wrap [&_code]:break-all [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:break-words">
                        <MessageResponse>{m.text}</MessageResponse>
                      </div>

                      {m.citations && m.citations.length > 0 && (
                        <div className="border-t border-border bg-muted/40 px-5 py-4">
                          <div className="mb-3 flex items-center gap-2">
                            <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Fuentes consultadas
                            </span>
                          </div>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {m.citations.map((c, i) => {
                              let host = c.url;
                              try {
                                host = new URL(c.url).hostname.replace(/^www\./, "");
                              } catch {
                                /* keep raw */
                              }
                              return (
                                <a
                                  key={i}
                                  href={c.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/50"
                                >
                                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                                    {i + 1}
                                  </div>
                                  <div className="flex min-w-0 flex-col">
                                    <span className="truncate text-sm font-medium text-card-foreground transition-colors group-hover:text-primary">
                                      {c.title ?? host}
                                    </span>
                                    <span className="truncate text-[11px] text-muted-foreground">
                                      {host}
                                    </span>
                                  </div>
                                </a>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </Message>
                ),
              )
            )}
            {pending && (
              <Message from="assistant">
                <MessageContent>
                  <Shimmer>Pensando…</Shimmer>
                </MessageContent>
              </Message>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="sticky bottom-0 border-t border-border/40 bg-background/95 pb-4 pt-3 backdrop-blur">
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
