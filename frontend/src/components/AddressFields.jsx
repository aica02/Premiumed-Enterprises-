import React from "react";
import luzonLocations from "../data/luzonLocations.json";
import "../styles/addressFields.css";

const { provinces, citiesByProvince } = luzonLocations;

const AddressFields = ({
  label = "Address",
  provinceName = "province",
  cityName = "city",
  province,
  city,
  onChange,
  onBlur,
  onProvinceChange,
  errors = {},
  touched = {},
  className = "",
}) => {
  const provinceCities = citiesByProvince[province] || [];

  return (
    <div className={`address-fields ${className}`.trim()}>
      <label className="address-fields-label" htmlFor={`${provinceName}-select`}>
        {label}
      </label>
      <div className="address-fields-row">
        <div className="address-fields-control">
          <select
            id={`${provinceName}-select`}
            name={provinceName}
            value={province || ""}
            onChange={(event) => {
              if (event.target.value !== province) onProvinceChange?.();
              onChange(event);
            }}
            onBlur={(event) => onBlur?.(provinceName, event.target.value)}
            aria-label="Province"
            aria-invalid={Boolean(touched[provinceName] && errors[provinceName])}
            className={touched[provinceName] && errors[provinceName] ? "input-error" : ""}
          >
            <option value="">Select province</option>
            {province &&
              !provinces.some((item) => item.name === province) && (
                <option value={province} disabled>
                  {province} (saved value)
                </option>
              )}
            {provinces.map((item) => (
              <option key={item.code} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
          {touched[provinceName] && errors[provinceName] && (
            <div className="inline-error-message">{errors[provinceName]}</div>
          )}
        </div>
        <div className="address-fields-control">
          <select
            id={`${cityName}-select`}
            name={cityName}
            value={city || ""}
            onChange={onChange}
            onBlur={(event) => onBlur?.(cityName, event.target.value)}
            aria-label="City or municipality"
            aria-invalid={Boolean(touched[cityName] && errors[cityName])}
            disabled={!province}
            className={touched[cityName] && errors[cityName] ? "input-error" : ""}
          >
            <option value="">
              {province ? "Select city or municipality" : "Select province first"}
            </option>
            {city &&
              !provinceCities.includes(city) && (
                <option value={city} disabled>
                  {city} (saved value)
                </option>
              )}
            {provinceCities.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          {touched[cityName] && errors[cityName] && (
            <div className="inline-error-message">{errors[cityName]}</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AddressFields;
