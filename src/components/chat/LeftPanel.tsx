import type { AppDispatch, RootState } from "@/store";
import { addExtraWidth, reduceExtraWidth, toggleLeftPanel } from "@/store/chatSlice";
import { useDispatch, useSelector } from "react-redux";
import { Button } from "../ui/button";
import { PanelLeft, Plus, Search } from "lucide-react";
import { toggleAddSourceNoteModal } from "@/store/addSourceSlice";

const LeftPanel = () => {

     const dispatch = useDispatch<AppDispatch>();
  const { leftPanelOpen } = useSelector((state: RootState) => state.chat);

  function togglePanel() {
    if (leftPanelOpen) {
      dispatch(addExtraWidth());
      dispatch(toggleLeftPanel())
    } else {
      dispatch(reduceExtraWidth());
      dispatch(toggleLeftPanel())

    }
  }
    return ( <div
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
        <div className="flex mt-3 justify-between">
          <Button onClick={()=>dispatch(toggleAddSourceNoteModal())} variant="outline" className="rounded-3xl px-5 py-4 w-40">
            <Plus size={18} /> Add
          </Button>
          <Button variant="outline" className="rounded-3xl px-5 py-4 w-40">
            <Search size={18} /> Discover
          </Button>
        </div>
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

</div> );
}
 
export default LeftPanel;