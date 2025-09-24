
import { Label } from "@radix-ui/react-label";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import React from "react";
import { Textarea } from "../ui/textarea";
import { BaseModal } from "../base/BaseModal";

export const EditNoteModal = () => {
  const [open, setOpen] = React.useState(false)
  return (




    <div>


      <Button variant="outline" onClick={() => setOpen(true)}>
        Open Dialog
      </Button>

      <BaseModal
        open={open}
        onOpenChange={setOpen}
        title="Edit Note"
        description=""
        width={400}
        height={250}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button>Save changes</Button>
          </>
        }
      >

        <div className="grid gap-3">
          <Label htmlFor="name-1">Name</Label>
          <Input id="name-1" name="name" defaultValue="Pedro Duarte" />
         
        </div>
      </BaseModal>
    </div>

  );
}

export default EditNoteModal;