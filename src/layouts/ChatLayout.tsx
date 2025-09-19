 import React from "react";
import { Link, Outlet } from "react-router";

export default function ChatLayout() {
  return (
    <div>
        
        <div>
            <Outlet />
        </div>
    </div>
  );
}