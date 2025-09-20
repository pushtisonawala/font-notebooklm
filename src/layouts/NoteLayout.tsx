 import React from "react";
import { Link, Outlet } from "react-router";

export default function NoteLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Navbar */}
      <header className="flex items-center justify-between px-6 py-3 border-b bg-white shadow-sm">
        {/* Left: Logo + Title */}
        <Link to="/" className="flex items-center space-x-2">
         
          <span className="font-semibold text-lg text-gray-800">
            NotebookLM
          </span>
        </Link>

        {/* Right: Menu items */}
        <div className="flex items-center space-x-4">
        
          <img
            src="/avatar.png" // replace with your avatar
            alt="User"
            className="w-8 h-8 rounded-full border"
          />
        </div>
      </header>

      {/* Page Content */}
      <main className="flex-1 p-6 bg-gray-50">
        <Outlet />
      </main>
    </div>
  );
}