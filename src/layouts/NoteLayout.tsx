import { logoutUser } from "@/api/auth";
import { getUserData } from "@/helper/getUserData";
import React, { useState, useRef, useEffect } from "react";
import { Link, Outlet } from "react-router";

export default function NoteLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
const userData=getUserData()
 
  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

        {/* Right: Avatar & Menu */}
        <div className="relative" ref={menuRef}>
          <img
            src={userData?.image}
            alt="User"
            className="w-8 h-8 rounded-full border cursor-pointer"
            onClick={() => setMenuOpen(!menuOpen)}
          />

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-68 bg-white border rounded-lg shadow-lg z-50">
              <div className="flex items-center p-4 border-b">
                <img
                  src={userData?.image}
                  alt="User"
                  className="w-10 h-10 rounded-full mr-3"
                />
                <div>
                  <p className="font-semibold text-gray-800">{userData?.name}</p>
                  <p className="text-sm text-gray-500">{userData?.email}</p>
                </div>
              </div>
              <div className="flex flex-col py-2">
              
                <button
                  className="px-4 py-2 text-gray-700 text-left hover:bg-gray-100"
                  onClick={() => logoutUser()}
                >
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Page Content */}
      <main className="flex-1 p-6 bg-gray-50">
        <Outlet />
      </main>
    </div>
  );
}
