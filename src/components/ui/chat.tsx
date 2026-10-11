import { cn } from "@/lib/utils"

/** One row of a chat. `align="end"` puts it on the right (the user's side). */
function Message({ align = "start", className, ...props }: React.ComponentProps<"div"> & { align?: "start" | "end" }) {
  return (
    <div
      data-slot="message"
      className={cn("flex w-full animate-in duration-300 fade-in slide-in-from-bottom-2", align === "end" ? "flex-row-reverse" : "flex-row", className)}
      {...props}
    />
  )
}

function MessageContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="message-content" className={cn("flex max-w-[85%] min-w-0 flex-col gap-1", className)} {...props} />
}

function Bubble({ variant = "default", className, ...props }: React.ComponentProps<"div"> & { variant?: "default" | "muted" | "destructive" }) {
  return (
    <div
      data-slot="bubble"
      data-variant={variant}
      className={cn(
        "rounded-2xl px-3 py-2 text-sm leading-relaxed break-words",
        variant === "default" && "self-end bg-primary text-primary-foreground",
        variant === "muted" && "bg-muted text-foreground",
        variant === "destructive" && "bg-destructive/10 text-destructive",
        className,
      )}
      {...props}
    />
  )
}

/** Shimmering status line, e.g. "Gemini is typing…". */
function Marker({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="marker" role="status" className={cn("text-sm", className)} {...props} />
}

function MarkerContent({ className, ...props }: React.ComponentProps<"span">) {
  return <span data-slot="marker-content" className={cn("shimmer", className)} {...props} />
}

export { Bubble, Marker, MarkerContent, Message, MessageContent }
