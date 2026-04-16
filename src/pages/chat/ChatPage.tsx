import LeftPanel from '@/components/chat/LeftPanel'
import MiddlePanel from '@/components/chat/MiddlePanel'
import RightPanel from '@/components/chat/RightPanel'
import CreateNoteModal from '@/components/note/CreateNoteModal'


function ChatPage() {
  return (
    <>
     <div className="flex h-screen gap-4">
                   
        <LeftPanel/>
        <MiddlePanel></MiddlePanel>
  <RightPanel/>

<CreateNoteModal></CreateNoteModal>
                   
                </div>
    
      
    </>
  )
}

export default ChatPage
