import { apiUrl } from "@/config/get-env";
import { getUserData } from "@/helper/getUserData";
import { makeHttpReq } from "@/helper/makeHttpReq";
import type { NoteServerData } from "@/types/note-types";

type UploadedNoteResponse = {
  message: string;
  note: {
    _id: string;
    files: Array<{
      fileId: string;
      filename: string;
      originalName: string;
      mimetype: string;
      size: number;
      extractedText?: string;
    }>;
  };
  filesUploaded: number;
};

export async function getNotes(page = 1, search: string = ''): Promise<NoteServerData> {
  const data = await makeHttpReq('GET', `notes?page=${page}&search=${search}`) as NoteServerData
  return data
}


// ✅ download file from backend using drive fileId
const downloadFile = async (fileId: string) => {

  const userData = getUserData()

  const userId = userData?._id
  const noteId = userData?.activeNoteId   // or replace with correct noteId if needed

  console.log("Downloading file:", fileId)

  const response = await fetch(`${apiUrl}/api/v1/notes/drive-files`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fileId,
      userId,
      noteId
    }),
  })

  if (!response.ok) {
    throw new Error("Failed to download file")
  }

  const fileBlob = await response.blob()

  return new File([fileBlob], "drive-file")
}



// ✅ Upload selected google drive files
export const uploadPickedFiles = async (docs: any[]): Promise<UploadedNoteResponse> => {

  const formData = new FormData()
  const userData = getUserData()

  for (const doc of docs) {
    console.log("Doc selected:", doc)
    let fileToUpload;
    let fileName = doc.name;
    if (doc.file) {
      // Local file upload
      fileToUpload = doc.file;
    } else {
      // Google Drive file
      fileToUpload = await downloadFile(doc.id);
    }
    formData.append("files", fileToUpload, fileName);
  }

  formData.append("userId", userData?._id)

  try {

    const response = await fetch(`${apiUrl}/api/v1/notes`, {
      method: "POST",
      body: formData,
      credentials: "include",
    })

    if (!response.ok) {
      throw new Error("Upload failed")
    }

    const data = await response.json()

    console.log("Upload success:", data)
    return data as UploadedNoteResponse

  } catch (error) {

    console.error("Upload error:", error)
    throw error

  }
}
