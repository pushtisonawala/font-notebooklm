import type { AppDispatch, RootState } from "@/store";
import { addExtraWidth, reduceExtraWidth, toggleLeftPanel, setSelectedFiles } from "@/store/chatSlice";
import { useDispatch, useSelector } from "react-redux";
import { Button } from "../ui/button";
import { PanelLeft, Plus, Search } from "lucide-react";
import { toggleAddSourceNoteModal } from "@/store/addSourceSlice";
import { useEffect, useState } from "react";
import { getNotes } from "@/api/notes";
import { getUserData } from "@/helper/getUserData";

const LeftPanel = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { leftPanelOpen } = useSelector((state: RootState) => state.chat);
  const [sources, setSources] = useState<any[]>([]);
  const userData = getUserData();
  const selectedFiles = useSelector((state: RootState) => state.chat.selectedFiles);

  function togglePanel() {
    if (leftPanelOpen) {
      dispatch(addExtraWidth());
      dispatch(toggleLeftPanel());
    } else {
      dispatch(reduceExtraWidth());
      dispatch(toggleLeftPanel());
    }
  }

  // Fetch user's files on mount or when panel opens
  useEffect(() => {
    const fetchSources = async () => {
      const notes = await getNotes();
      // Aggregate files from ALL notes, not just current user
      const allFiles = (notes.notes || []).flatMap((n: any) => (n.files || []).map((f: any) => ({ ...f, noteId: n._id, userId: n.userId })));
      setSources(allFiles);
    };
    if (leftPanelOpen) fetchSources();
    // eslint-disable-next-line
  }, [leftPanelOpen]);

  // Handle file selection
  const handleFileClick = (file: any) => {
    let newSelected;
    if (selectedFiles.some((f: any) => f.fileId === file.fileId)) {
      // Deselect
      newSelected = selectedFiles.filter((f: any) => f.fileId !== file.fileId);
    } else {
      // Select
      newSelected = [...selectedFiles, file];
    }
    dispatch(setSelectedFiles(newSelected));
  };

  return (
    <div
      className={`bg-white shadow-md h-full transition-all duration-300 ${
        leftPanelOpen
          ? "w-[25%] p-4 rounded-md"
          : "w-16 p-2 rounded-r-2xl rounded-l-2xl"
      }`}
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-2">
        {leftPanelOpen && <p className="text-base text-gray-800">Sources</p>}
        <Button
          variant="link"
          size="icon"
          className="size-8 hover:bg-slate-100 cursor-pointer"
          onClick={() => togglePanel()}
        >
          <PanelLeft size={35}></PanelLeft>
        </Button>
      </div>
      {leftPanelOpen && <hr />}
      {/* Buttons */}
      {leftPanelOpen ? (
        <>
          <div className="flex mt-3 justify-between">
            <Button onClick={()=>dispatch(toggleAddSourceNoteModal())} variant="outline" className="rounded-3xl px-5 py-4 w-35">
              <Plus size={18} /> Add
            </Button>
            <Button variant="outline" className="rounded-3xl px-5 py-3 w-35">
              <Search size={18} /> Discover
            </Button>
          </div>
          {/* User's uploaded sources */}
          <div className="mt-6">
            <div className="font-semibold mb-2">Your Sources:</div>
            {sources.length === 0 ? (
              <div className="text-gray-500 text-sm">No sources uploaded yet.</div>
            ) : (
              <ul className="max-h-40 overflow-y-auto text-left">
                {sources.map((file, idx) => {
                  const isSelected = selectedFiles.some((f: any) => f.fileId === file.fileId);
                  return (
                    <li
                      key={file.fileId || idx}
                      className={`flex items-center gap-2 py-1 px-2 bg-white rounded mb-1 border cursor-pointer hover:bg-indigo-50 ${isSelected ? 'bg-indigo-100 border-indigo-500' : ''}`}
                      onClick={() => handleFileClick(file)}
                    >
                      <input type="checkbox" checked={isSelected} readOnly className="mr-2" />
                      <span className="truncate max-w-xs">{file.originalName || file.filename}</span>
                      <span className="text-xs text-gray-400">({file.mimetype})</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center mt-6 gap-4">
          <Button variant="outline" size="icon">
            <Plus size={18} />
          </Button>
          <Button variant="outline" size="icon">
            <Search size={18} />
          </Button>
        </div>
      )}
    </div>
  );
}
export default LeftPanel;