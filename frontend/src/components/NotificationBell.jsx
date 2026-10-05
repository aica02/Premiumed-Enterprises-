import React, { useEffect, useState } from "react";
import axios from "axios";
import "../styles/NotificationBell.css";
import { FaBell } from "react-icons/fa6";

const BACKEND_URL =
  import.meta.env.VITE_API_URL ||
  (window.location.hostname === "localhost" ? "http://localhost:5000" : "");

const NotificationBell = ({
  userName,
  isOpen,
  onToggle,
  fetchUrl,
  markReadUrl,
  markAllReadUrl,
  emptyText = "No notifications",
  title = "Notifications",
}) => {
  const [notifications, setNotifications] = useState([]);
  const [hasUnread, setHasUnread] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const previewLimit = 5;

  useEffect(() => {
    const fetchNotifications = async () => {
      if (!userName || !fetchUrl) return;

      try {
        const res = await axios.get(fetchUrl);
        const data = Array.isArray(res.data) ? res.data : [];
        setNotifications(data);
        setHasUnread(data.some((n) => !n.isRead));
      } catch (err) {
        console.error("Error fetching notifications", err);
      }
    };

    fetchNotifications();
  }, [fetchUrl, userName]);

  const handleNotificationClick = async (e, notification) => {
    e?.stopPropagation();
    if (notification.isRead || !markReadUrl) return;

    const notificationId = notification._id || notification.id;
    const singleReadUrl = markReadUrl.includes("/read/")
      ? `${markReadUrl}/${notificationId}`
      : `${markReadUrl}/${notificationId}/read`;

    try {
      await axios.patch(singleReadUrl);
      setNotifications((prev) => {
        const updated = prev.map((n) =>
          n._id === notificationId ? { ...n, isRead: true } : n,
        );

        setHasUnread(updated.some((n) => !n.isRead));

        return updated;
      });
    } catch (err) {
      console.error("Error marking notification as read:", err);
    }
  };

  const handleMarkAllAsRead = async (e) => {
    e?.stopPropagation();

    if (!hasUnread || !markAllReadUrl) return;

    try {
      await axios.patch(markAllReadUrl);

      setNotifications((prev) =>
        prev.map((notification) => ({
          ...notification,
          isRead: true,
        })),
      );

      setHasUnread(false);
    } catch (err) {
      console.error("Error marking all notifications as read:", err);
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const visibleNotifications = showAll
    ? notifications
    : notifications.slice(0, previewLimit);

  return (
    <div
      className="admin-nav-icon-wrapper"
      title="Notification"
      onClick={onToggle}
    >
      <FaBell className="admin-nav-icon" />
      {hasUnread && <span className="admin-notif-dot"></span>}

      {isOpen && (
        <div className="admin-dropdown-menu notif-dropdown">
          <div className="notif-header-container">
            <div className="notif-title-wrapper">
              <FaBell className="notif-title-icon" />
              <h4 className="notif-header">{title}</h4>

              {unreadCount > 0 && (
                <span className="notif-count">{unreadCount}</span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                className="mark-all-read-btn"
                onClick={handleMarkAllAsRead}
              >
                Mark all as read
              </button>
            )}
          </div>

          <div className="notif-divider"></div>

          <div className="notif-scroll-container">
            {notifications.length > 0 ? (
              <>
                {visibleNotifications.map((n, index) => (
                  <div
                    key={n._id || index}
                    className={`notif-item ${n.isRead ? "read" : "unread"}`}
                    onClick={(e) => handleNotificationClick(e, n)}
                  >
                    <div className="notif-content">
                      <p className="notif-text">{n.message}</p>

                      <small className="notif-date">
                        {new Date(n.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                        {" • "}
                        {new Date(n.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </small>
                    </div>

                    {!n.isRead && <span className="notif-unread-dot"></span>}
                  </div>
                ))}
              </>
            ) : (
              <div className="notif-empty-container">
                <FaBell className="notif-empty-icon" />
                <p className="notif-empty">{emptyText}</p>
                <span className="notif-empty-subtext">
                  You&apos;re all caught up!
                </span>
              </div>
            )}
          </div>

          <div className="notif-footer">
            {notifications.length > previewLimit && (
              <button
                className="view-all-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAll((prev) => !prev);
                }}
              >
                {showAll ? "Show less" : "View all"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
