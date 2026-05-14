"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { toastResponseError } from "@/lib/client-errors";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getFirebaseAuth } from "@/lib/firebase/client";

interface DeleteAccountButtonProps {
  email: string | null;
}

export function DeleteAccountButton({ email }: DeleteAccountButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const confirmed = confirmation === "DELETE";

  const deleteAccount = async () => {
    if (!confirmed || pending) return;
    setPending(true);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (!res.ok) {
        await toastResponseError(res, "Could not delete account");
        setPending(false);
        return;
      }
      await signOut(getFirebaseAuth()).catch(() => undefined);
      toast.success("Account deleted.");
      router.replace("/sign-in");
      router.refresh();
    } catch {
      toast.error("Could not delete account", { description: "Please try again." });
      setPending(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-4" />
        Delete account
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete account?</DialogTitle>
            <DialogDescription>
              This deletes your Branchback account and saved projects. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="delete-confirm">
              Type DELETE to confirm
            </label>
            <Input
              id="delete-confirm"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder="DELETE"
              autoComplete="off"
            />
            {email && (
              <p className="text-xs text-muted-foreground">
                Account: {email}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={deleteAccount}
              disabled={!confirmed || pending}
            >
              {pending ? "Deleting..." : "Delete account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
