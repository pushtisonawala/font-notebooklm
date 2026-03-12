import { useEffect, useState, useRef } from "react";
// FileUpload component for local files with selection and review
const FileUpload = ({ selectedFiles, setSelectedFiles }: {
    selectedFiles: File[],
    setSelectedFiles: (files: File[]) => void
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFiles = (files: FileList | null) => {
        if (!files) return;
        setSelectedFiles([...selectedFiles, ...Array.from(files)]);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        handleFiles(e.dataTransfer.files);
    };

    const handleChooseFile = () => {
        fileInputRef.current?.click();
    };

    const handleRemoveFile = (index: number) => {
        setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
    };

    return (
        <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            style={{
                border: "2px dashed #aaa",
                padding: "2rem",
                textAlign: "center",
                borderRadius: "8px",
                background: "#fafafa"
            }}
            className="mb-8 mt-6 border-2 border-dashed border-gray-300 rounded-lg p-8 flex flex-col items-center justify-center text-center"
        >
            <div className="bg-indigo-50 rounded-full p-4 mb-3">
                <svg
                    className="w-8 h-8 text-indigo-500"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M16 12l-4-4m0 0l-4 4m4-4v12" />
                </svg>
            </div>
            <p className="font-medium text-gray-900">Upload sources</p>
            <p className="text-gray-500 text-sm mb-2">
                Drag & drop or <span className="text-indigo-600 cursor-pointer" onClick={handleChooseFile}>choose file</span> to upload
            </p>
            <p className="text-gray-400 text-xs">
                Supported file types: PDF, .txt, Markdown, Audio (e.g. mp3)
            </p>
            <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                multiple
                accept=".pdf,.txt,.md,.mp3,.wav,.m4a"
                onChange={e => handleFiles(e.target.files)}
            />
            {selectedFiles.length > 0 && (
                <div className="mt-4 w-full">
                    <div className="font-semibold mb-2">{selectedFiles.length} file(s) selected:</div>
                    <ul className="text-left max-h-32 overflow-y-auto">
                        {selectedFiles.map((file, idx) => (
                            <li key={idx} className="flex items-center justify-between py-1 px-2 bg-white rounded mb-1 border">
                                <span className="truncate max-w-xs">{file.name}</span>
                                <button className="text-red-500 ml-2 text-xs" onClick={() => handleRemoveFile(idx)}>Remove</button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};
import { BaseModal } from "../base/BaseModal"
import { Button } from "../ui/button"
import { ClipboardMinus, HardDrive, Link2, Newspaper, Search, Youtube } from "lucide-react";
import type { AppDispatch, RootState } from "@/store";
import { useDispatch, useSelector } from "react-redux";
import { toggleAddSourceNoteModal } from "@/store/addSourceSlice";
import useDrivePicker from 'react-google-drive-picker'
import { developerKey, googleClientId } from "@/config/get-env";
import { getUserData } from "@/helper/getUserData";
import { uploadPickedFiles, getNotes } from "@/api/notes";





const CreateNoteModal = () => {
    const dispatch = useDispatch<AppDispatch>();
    const { modal } = useSelector((state: RootState) => state.addSource);
    const userData = getUserData();
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [sources, setSources] = useState<any[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [openPicker, data, authResponse] = useDrivePicker();

    // Fetch sources for all users (all files from all notes)
    const fetchSources = async () => {
        const notes = await getNotes();
        console.log('Fetched notes:', notes);
        // Only show files for the current user
        const userNotes = notes.notes?.filter((n: any) => n.userId === userData?._id) || [];
        const allFiles = userNotes.flatMap((n: any) => (n.files || []).map((f: any) => ({ ...f, noteId: n._id })));
        console.log('User files:', allFiles);
        setSources(allFiles);
    };

    // Google Drive picker
    const handleOpenPicker = async () => {
        openPicker({
            clientId: googleClientId,
            developerKey: developerKey,
            viewId: "DOCS",
            token: userData?.googleAccessToken,
            showUploadView: true,
            showUploadFolders: true,
            supportDrives: true,
            multiselect: true,
        });
        dispatch(toggleAddSourceNoteModal());
    };

    // Handle Google Drive file selection
    useEffect(() => {
        if (data?.action === "picked") {
            setSelectedFiles([]); // Clear local files
            setIsUploading(true);
            uploadPickedFiles(data.docs).then(() => {
                setIsUploading(false);
                fetchSources();
            });
        }
        // eslint-disable-next-line
    }, [data]);

    // Fetch sources when modal opens
    useEffect(() => {
        if (modal) fetchSources();
        // eslint-disable-next-line
    }, [modal]);

    // Handle local file upload
    const handleSaveFiles = async () => {
        if (selectedFiles.length === 0) return;
        setIsUploading(true);
        const docs = selectedFiles.map(file => ({ id: URL.createObjectURL(file), name: file.name, file, isLocal: true }));
        await uploadPickedFiles(docs);
        setIsUploading(false);
        setSelectedFiles([]);
        fetchSources();
    };

    return (
        <div>
            <BaseModal
                open={modal}
                onOpenChange={() => dispatch(toggleAddSourceNoteModal())}
                title="NotebookLM"
                description=""
                width={850}
                height={600}
                footer={
                    <>
                        <Button variant="outline" onClick={() => dispatch(toggleAddSourceNoteModal())}>
                            Cancel
                        </Button>
                        <Button onClick={handleSaveFiles} disabled={selectedFiles.length === 0 || isUploading}>
                            {isUploading ? "Saving..." : "Save selected files"}
                        </Button>
                    </>
                }
            >
                <div className="flex justify-between mb-10 ">
                    <div className="text-xl font-semibold">Add Sources</div>
                    <div>
                        <button className="flex gap-2  bg-indigo-100 rounded-full p-2 px-3 font-semibold text-indigo-600 ">
                            <Search className="mt-1" size={16}></Search> <span>Discover sources</span>
                        </button>
                    </div>
                </div>
                <div>
                    <p className="text-sm">Sources let NotebookLM base its responses on the information that matters most to you.
                        (Examples: marketing plans, course reading, research notes, meeting transcripts, sales documents, etc.)</p>
                </div>
                <FileUpload selectedFiles={selectedFiles} setSelectedFiles={setSelectedFiles} />
                {/* Uploaded sources display */}
                <div className="mt-6">
                    <div className="font-semibold mb-2">Uploaded Sources:</div>
                    {sources.length === 0 ? (
                        <div className="text-gray-500 text-sm">No sources uploaded yet.</div>
                    ) : (
                        <ul className="max-h-32 overflow-y-auto text-left">
                            {sources.map((file, idx) => (
                                <li
                                    key={file.fileId || idx}
                                    className="flex items-center gap-2 py-1 px-2 bg-white rounded mb-1 border cursor-pointer hover:bg-indigo-50"
                                    onClick={() => alert(`Selected file: ${file.originalName || file.filename}\nReady for chat!`)}
                                >
                                    <span className="truncate max-w-xs">{file.originalName || file.filename}</span>
                                    <span className="text-xs text-gray-400">({file.mimetype})</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                {/* div card :actions buttons  */}
                <div className="flex gap-2 mt-8">
                    <div className="flex-1 rounded-md border border-gray-200 p-4">
                        <div className="mb-5 ">
                            <p className="text-gray-900">Google Workspace</p>
                        </div>
                        <button onClick={() => handleOpenPicker()} className="flex cursor-pointer gap-2 bg-slate-100 p-2 rounded-md text-sm text-blue-600 font-semibold">
                            <HardDrive></HardDrive>
                            Google Drive
                        </button>
                    </div>
                    <div className="flex-1 rounded-md border border-gray-200 p-4">
                        <div className="flex gap-1 mb-5 ">
                            <Link2></Link2>
                            <p className="text-gray-900 font-semibold">Link</p>
                        </div>
                        <div className="flex gap-2">
                            <button className="flex bg-slate-100 gap-2 p-2 rounded-md text-sm text-blue-600 font-semibold">
                                <Newspaper size={20}></Newspaper>   Website
                            </button>
                            <button className="flex gap-2 bg-slate-100 p-2 rounded-md text-sm text-blue-600 font-semibold">
                                <span><Youtube></Youtube></span> Youtube
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 rounded-md border border-gray-200 p-4">
                        <div className="mb-5 ">
                            <p className="flex gap-2 font-semibold text-gray-900">
                                <ClipboardMinus></ClipboardMinus> Paste text
                            </p>
                        </div>
                        <button className="bg-slate-100 p-2 rounded-md text-sm text-blue-600 font-semibold">Copied text</button>
                    </div>
                </div>
            </BaseModal>
        </div>
    );
}

export default CreateNoteModal;