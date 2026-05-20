// src/components/SearchBar.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function SearchBar({ placeholder = "Search films..." }) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const navigate = useNavigate();

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <div
      className={[
        "transition-all duration-200 ease-out",
        focused ? "scale-[1.02] shadow-[0_0_0_2px_rgba(250,204,21,0.35)]" : "scale-100",
      ].join(" ")}
    >
      <input
        type="text"
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="px-4 py-2 bg-zinc-800 text-white rounded-full w-full max-w-sm outline-none transition-[padding,width] duration-200 ease-out focus:px-5 focus:py-2.5"
      />
    </div>
  );
}

export default SearchBar;
