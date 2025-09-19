 import React from "react";
import { Link, Outlet } from "react-router";

export default function NoteLayout() {
  return (
    <div>
        
        <div>
            <Outlet />
        </div>
    </div>
  );
}