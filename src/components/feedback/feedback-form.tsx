"use client";

import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface FeedbackFormProps {
  userEmail: string | null;
}

export function FeedbackForm({ userEmail }: FeedbackFormProps) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const submitFeedback = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      toast.error("Add a message before sending feedback.");
      return;
    }

    const body = [
      trimmedMessage,
      "",
      "---",
      `From: ${userEmail ?? "Signed-in Branchback user"}`,
      `Page: ${window.location.href}`,
    ].join("\n");
    const href = `mailto:support@microfalls.com?subject=${encodeURIComponent(
      subject.trim() || "Branchback feedback",
    )}&body=${encodeURIComponent(body)}`;

    window.location.href = href;
    toast.success("Opening your email draft.");
  };

  return (
    <form onSubmit={submitFeedback} className="flex flex-col gap-5">
      <label className="flex flex-col gap-2 text-sm font-medium">
        Subject
        <Input
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          placeholder="What should we look at?"
        />
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium">
        Feedback
        <Textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Share what happened, what you expected, or what would make Branchback better."
          className="min-h-36"
          required
        />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Sends via your email client to support@microfalls.com.
        </p>
        <Button type="submit">Send feedback</Button>
      </div>
    </form>
  );
}
