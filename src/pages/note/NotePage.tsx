import CreateNoteModal from '@/components/note/CreateNoteModal';
import NoteCard from '@/components/note/NoteCard';
import { Plus } from 'lucide-react'
import { useState } from 'react'


function NotePage() {
  const [count, setCount] = useState(0)

  const notebooks = [

    {
        id: 1,
        title: "Untitled notebook",
        date: "Aug 29, 2025",
        sources: 0,
        color: "bg-violet-50",
        image: ""
    },
    {
        id: 2,
        title: "Retrieval-Augmented Generation",
        date: "Aug 25, 2025",
        sources: 14,
        color: "bg-violet-50",
    },
    {
        id: 3,
        title: "LLM Powered Autonomous Agent",
        date: "Aug 15, 2025",
        sources: 11,
        color: "bg-violet-50",
    },
    {
        id: 4,
        title: "Media Congo: News, Jobs, and...",
        date: "Mar 28, 2025",
        sources: 5,
        color: "bg-green-50",
    },
];


  return (
    <>
     
    <main className="min-h-screen bg-gray-50 p-6">
           
            <h1 className="text-2xl font-bold text-gray-800 mb-6">
                Recent notebooks
            </h1>

            <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                {/* Create new notebook card */}
                <div className="flex items-center justify-center border-2 border-dashed border-gray-300 rounded-xl h-40 cursor-pointer hover:bg-gray-100 transition">
                    <div className="flex flex-col items-center">
                        <Plus className="w-8 h-8 text-blue-600 mb-2" />
                        <span className="text-gray-600 font-medium">
                            Create new notebook
                        </span>
                    </div>

                </div>


          <NoteCard notebooks={notebooks}/>
          <CreateNoteModal></CreateNoteModal>
            </div>
        </main>
      
    </>
  )
}

export default NotePage
