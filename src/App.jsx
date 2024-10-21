"use client"; // Indicates that this is a client-side component for Next.js

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit"; // Basic starter kit for TipTap editor
import Image from "@tiptap/extension-image"; // Image extension for TipTap to handle image rendering
import { Extension } from "@tiptap/core";
import { Plugin } from "prosemirror-state"; // Plugin allows you to customize the editor's behavior
import { DOMParser } from "prosemirror-model"; // DOMParser to transform pasted HTML into ProseMirror schema
import useImageApi from "./image.api";
import { setImageInfo } from "./setImageInfo";
import "./App.css"

const App = () => {
  // Destructure custom hooks to get functions for generating URL and uploading images to S3
  const { generateUrl, uploadImage: uploadTos3 } = useImageApi();

  // Image upload function that uploads the file to the server/S3
  const uploadImage = async (file) => {
    if (!file) return ""; // If no file is provided, return an empty string

    const formData = new FormData(); // Create FormData to send the image
    formData.append("file", file); // Append the image file to the FormData object

    try {
      // Get the pre-signed URL from the backend to upload the image
      const uploadInfo = await generateUrl([{ file: file.name }]);

      // Format the upload payload and image URL using a utility function
      const { payload, imageUrl } = setImageInfo(uploadInfo[0], file);

      // Upload the file to the S3 bucket using the generated payload
      await uploadTos3(payload);

      console.log("upload info", imageUrl); // Debugging output of the image URL

      return imageUrl; // Return the uploaded image URL from the server response
    } catch (error) {
      console.error("Image upload failed:", error); // Log any errors during upload
      return null; // Return null if the upload fails
    }
  };

  // Custom paste handler that intercepts paste events in the editor
  const pasteHandler = Extension.create({
    addProseMirrorPlugins() {
      return [
        new Plugin({
          props: {
            handlePaste(view, event) {
              const clipboardData = event.clipboardData; // Get the clipboard data
              if (clipboardData) {
                const html = clipboardData.getData("text/html"); // Get the HTML content from the clipboard

                if (html) {
                  // Create a temporary DOM element to parse the HTML
                  const tempDiv = document.createElement("div");
                  tempDiv.innerHTML = html;

                  // Find all <img> tags in the pasted HTML
                  const images = tempDiv.querySelectorAll("img");
                  images.forEach(async (img) => {
                    const src = img.src; // Get the image source (src attribute)

                    // Check if the image src is a local file (file:// URLs)
                    if (src.startsWith("file://")) {
                      console.log("Cannot load local resources:", src); // Log the local image path

                      // Try to extract the image file from clipboardData
                      const file = Array.from(clipboardData.items)
                        .find((item) => item.kind === "file") // Find the file item in the clipboard
                        ?.getAsFile(); // Get the file object

                      console.log(file, "this is file"); // Debugging: log the file object

                      if (file) {
                        // Upload the file using the custom upload function
                        const imageUrl = await uploadImage(file);

                        // Replace the file:// URL with the uploaded image URL
                        if (imageUrl) {
                          const transaction =
                            view.state.tr.replaceSelectionWith(
                              view.state.schema.nodes.image.create({
                                src: imageUrl, // Use the URL of the uploaded image
                              })
                            );
                          view.dispatch(transaction); // Dispatch the transaction to insert the image
                        }
                      }

                      return; // Skip further processing for this image
                    }

                    // Handle remote images (URLs starting with data:image/ or http)
                    if (
                      src.startsWith("data:image/") ||
                      src.startsWith("http")
                    ) {
                      const transaction = view.state.tr.replaceSelectionWith(
                        view.state.schema.nodes.image.create({ src }) // Insert remote image
                      );
                      view.dispatch(transaction); // Dispatch the transaction to insert the image
                    }
                  });

                  // Parse and insert the rest of the content (text, etc.)
                  const fragment = DOMParser.fromSchema(
                    view.state.schema
                  ).parse(tempDiv);
                  const transaction =
                    view.state.tr.replaceSelectionWith(fragment);
                  view.dispatch(transaction); // Insert the parsed content into the editor

                  event.preventDefault(); // Prevent the default paste behavior
                  return true; // Indicate that the paste event has been handled
                }

                // Handle direct image file pastes (dragged or copied images)
                for (let i = 0; i < clipboardData.items.length; i++) {
                  const item = clipboardData.items[i];

                  // Check if the clipboard item is an image
                  if (item.type.includes("image")) {
                    const file = item.getAsFile(); // Get the image file from the clipboard
                    if (file) {
                      const reader = new FileReader(); // Use FileReader to read the image
                      reader.onload = async () => {
                        // Convert the file to a base64 string
                        // const base64Image = reader.result;

                        // Upload the image using the custom upload function
                        const imageUrl = await uploadImage(file);
                        if (imageUrl) {
                          const transaction =
                            view.state.tr.replaceSelectionWith(
                              view.state.schema.nodes.image.create({
                                src: imageUrl, // Insert the uploaded image URL
                              })
                            );
                          view.dispatch(transaction); // Dispatch the transaction to insert the image
                        }
                      };

                      reader.readAsDataURL(file); // Convert the image file to base64 for preview
                      event.preventDefault(); // Prevent the default paste behavior
                    }
                  }
                }
              }
              return false; // Return false if the paste event is not handled
            },
          },
        }),
      ];
    },
  });

  // Initialize the TipTap editor with the custom paste handler
  const editor = useEditor({
    extensions: [
      StarterKit, // Basic extensions (paragraphs, bold, italic, etc.)
      Image, // Enable support for images in the editor
      pasteHandler, // Add custom paste handling functionality
    ],
    content: "<p>Copy and paste Word content here...</p>", // Default content
  });

  return (
    <div className="editor-wrapper">
      <h3>TipTap Editor with Automatic Image Upload for file:// Images</h3>
      <div
        style={{
          border: "1px solid #ccc", // Add a border around the editor
          minHeight: "200px", // Minimum height for the editor
          padding: "10px", // Padding inside the editor container
        }}
      >
        <EditorContent editor={editor} /> {/* Render the TipTap editor */}
      </div>
    </div>
  );
};

export default App;
