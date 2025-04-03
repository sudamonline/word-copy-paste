import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit"; // Basic starter kit for TipTap editor
import Image from "@tiptap/extension-image"; // Image extension for TipTap to handle image rendering
import { Extension } from "@tiptap/core";
import { Plugin } from "prosemirror-state"; // Plugin allows you to customize the editor's behavior
import { DOMParser } from "prosemirror-model"; // DOMParser to transform pasted HTML into ProseMirror schema
import useImageApi from "./image.api";
// import { setImageInfo } from "./setImageInfo";
import "./App.css";
import React, { useState } from "react";

const debugImageData = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      console.group("Image Debug Data");
      console.log("File name:", file.name);
      console.log("File type:", file.type);
      console.log("File size:", file.size, "bytes");
      console.log("Data URL preview:", reader.result.substring(0, 100) + "...");

      // Create an image element to check dimensions
      const img = new window.Image();
      img.onload = () => {
        console.log("Image dimensions:", img.width, "x", img.height);
        console.groupEnd();
        resolve(reader.result);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
};

// Custom Image extension configuration
const CustomImage = Image.configure({
  inline: true,
  allowBase64: true,
  HTMLAttributes: {
    class: "editor-image",
  },
});

// Add some basic styles for the editor
const editorStyles = `
  .editor-image {
    max-width: 100%;
    height: auto;
    margin: 1em 0;
  }
  .ProseMirror {
    min-height: 200px;
    padding: 1em;
  }
`;

// Helper function to convert base64 to file
const base64ToFile = (base64String, mimeType) => {
  const base64Data = base64String.split(',')[1];
  const byteCharacters = atob(base64Data);
  const byteArrays = [];
  
  for (let offset = 0; offset < byteCharacters.length; offset += 1024) {
    const slice = byteCharacters.slice(offset, offset + 1024);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }
  
  const blob = new Blob(byteArrays, { type: mimeType });
  return new File([blob], `pasted-image-${Date.now()}.${mimeType.split('/')[1]}`, { type: mimeType });
};

// Function to process a single image
const processImage = async (img, clipboardData, uploadImage) => {
  const src = img.src;
  console.log(`Processing image:`, src);

  if (src.startsWith("file://")) {
    const fileItem = Array.from(clipboardData.items).find(
      (item) => item.kind === "file"
    );

    if (fileItem) {
      const file = fileItem.getAsFile();
      if (file) {
        try {
          const imageUrl = await uploadImage(file);
          return { originalSrc: src, newSrc: imageUrl };
        } catch (error) {
          console.error("Error uploading local image:", error);
        }
      }
    }
  } else if (src.startsWith("data:image/")) {
    const mimeType = src.split(';')[0].split(':')[1];
    const file = base64ToFile(src, mimeType);
    
    try {
      const imageUrl = await uploadImage(file);
      return { originalSrc: src, newSrc: imageUrl };
    } catch (error) {
      console.error("Error uploading base64 image:", error);
    }
  }

  return { originalSrc: src, newSrc: src };
};

// Function to process all images in HTML content
const processImagesInHtml = async (html, clipboardData, uploadImage) => {
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;
  const images = tempDiv.querySelectorAll("img");
  
  const imageReplacements = new Map();
  
  const results = await Promise.all(
    Array.from(images).map(img => processImage(img, clipboardData, uploadImage))
  );
  
  results.forEach(({ originalSrc, newSrc }) => {
    if (newSrc) {
      imageReplacements.set(originalSrc, newSrc);
    }
  });
  
  return { tempDiv, imageReplacements };
};

// Function to insert content into editor
const insertContent = (view, tempDiv, imageReplacements) => {
  // Update image sources
  const images = tempDiv.querySelectorAll("img");
  images.forEach(img => {
    const newSrc = imageReplacements.get(img.src);
    if (newSrc) {
      img.src = newSrc;
    }
  });

  // Insert content
  const fragment = DOMParser.fromSchema(view.state.schema).parse(tempDiv);
  const transaction = view.state.tr.replaceSelectionWith(fragment);
  view.dispatch(transaction);
};

const App = () => {
  // Destructure custom hooks to get functions for generating URL and uploading images to S3
  const { generateUrl, uploadImage: uploadTos3 } = useImageApi();
  const [isPasting, setIsPasting] = useState(false);

  // Add styles to the document
  React.useEffect(() => {
    const style = document.createElement("style");
    style.textContent = editorStyles;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  // Image upload function that uploads the file to the server/S3
  const uploadImage = async (file) => {
    if (!file) return ""; // If no file is provided, return an empty string

    // Debug the image data before upload
    await debugImageData(file);

    const formData = new FormData(); // Create FormData to send the image
    formData.append("file", file); // Append the image file to the FormData object

    try {
      // Get the pre-signed URL from the backend to upload the image
      const uploadInfo = await generateUrl([{ file: file.name }]);

      const formData = new FormData();
      formData.append("file", file);
      // Format the upload payload and image URL using a utility function
      // const { payload, imageUrl } = setImageInfo(uploadInfo[0], file);

      // Upload the file to the S3 bucket using the generated payload
      console.log("uploadInfo", uploadInfo[0]);
      await uploadTos3(uploadInfo[0].presigned_url, formData);

      console.log("upload info", uploadInfo[0].file); // Debugging output of the image URL

      return uploadInfo[0].file; // Return the uploaded image URL from the server response
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
            async handlePaste(view, event) {
              try {
                setIsPasting(true);
                console.log("Paste event triggered");
                const clipboardData = event.clipboardData;
                
                if (clipboardData) {
                  const html = clipboardData.getData("text/html");
                  console.log("Pasted HTML content:", html);

                  if (html) {
                    const { tempDiv, imageReplacements } = await processImagesInHtml(
                      html,
                      clipboardData,
                      uploadImage
                    );
                    
                    insertContent(view, tempDiv, imageReplacements);
                    console.log("Content inserted successfully with updated image URLs");
                    
                    event.preventDefault();
                    return true;
                  }

                  // Handle direct image files
                  for (let i = 0; i < clipboardData.items.length; i++) {
                    try {
                      const item = clipboardData.items[i];
                      if (item.type.includes("image")) {
                        const file = item.getAsFile();
                        if (file) {
                          const imageUrl = await uploadImage(file);
                          if (imageUrl) {
                            const imageNode = view.state.schema.nodes.image.create({
                              src: imageUrl,
                              alt: file.name || "Pasted image",
                              title: file.name || "Pasted image"
                            });
                            
                            const pos = view.state.selection.from;
                            const transaction = view.state.tr.replaceWith(pos, pos, imageNode);
                            view.dispatch(transaction);
                          }
                        }
                      }
                    } catch (error) {
                      console.error("Error processing clipboard item:", error);
                    }
                  }
                }
              } catch (error) {
                console.error("Error handling paste event:", error);
              } finally {
                setIsPasting(false);
              }
              return false;
            },
          },
        }),
      ];
    },
  });

  // Initialize the TipTap editor with the custom paste handler
  const editor = useEditor({
    extensions: [
      StarterKit,
      CustomImage, // Use the configured Image extension
      pasteHandler,
    ],
    content: "<p>Copy and paste Word content here...</p>",
    editorProps: {
      attributes: {
        class:
          "prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none",
      },
    },
  });

  return (
    <div className="editor-wrapper">
      <h3>TipTap Editor with Automatic Image Upload for file:// Images</h3>
      <div
        style={{
          border: "1px solid #ccc",
          minHeight: "200px",
          padding: "10px",
          position: "relative",
        }}
      >
        {isPasting && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(255, 255, 255, 0.7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
            }}
          >
            <div
              style={{
                padding: "20px",
                backgroundColor: "white",
                borderRadius: "8px",
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  border: "4px solid #f3f3f3",
                  borderTop: "4px solid #3498db",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                }}
              />
              <span>Processing content and uploading images...</span>
            </div>
          </div>
        )}
        <EditorContent editor={editor} />
      </div>
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
};

export default App;
