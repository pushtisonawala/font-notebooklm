import LeftPanel from '@/components/chat/LeftPanel'
import MiddlePanel from '@/components/chat/MiddlePanel'
import RightPanel from '@/components/chat/RightPanel'
import { useState } from 'react'


function ChatPage() {
  const [count, setCount] = useState(0)

  return (
    <>
     <div className="flex h-screen gap-4">
                   
        <LeftPanel/>
        <MiddlePanel></MiddlePanel>
  <RightPanel/>

                   
                </div>
    
      
    </>
  )
}

export default ChatPage
