

export function formatDate(dateStr:string){
  
  const dateObj = new Date(dateStr);

const formatted = dateObj.toLocaleDateString("en-US", {
  month: "short", // Aug
  day: "2-digit", // 29
  year: "numeric" // 2025
});

return formatted
}
