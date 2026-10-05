import React from "react";
import { MdRefresh } from "react-icons/md";
import { FaSearch } from "react-icons/fa";
import "../styles/EmptyState.css";

export default function EmptyState({
  icon = <FaSearch />,
  title = "Nothing found",
  message = "There is nothing to display here.",
  buttonText,
  onButtonClick,
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>

      <h3>{title}</h3>

      <p>{message}</p>

      {buttonText && onButtonClick && (
        <button className="empty-state-button" onClick={onButtonClick}>
          <MdRefresh />
          {buttonText}
        </button>
      )}
    </div>
  );
}
