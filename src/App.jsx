import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit"; // Basic starter kit for TipTap editor
import Image from "@tiptap/extension-image"; // Image extension for TipTap to handle image rendering
import { Extension } from "@tiptap/core";
import { Plugin } from "prosemirror-state"; // Plugin allows you to customize the editor's behavior
import { DOMParser } from "prosemirror-model"; // DOMParser to transform pasted HTML into ProseMirror schema
import useImageApi from "./image.api";
// import { setImageInfo } from "./setImageInfo";
import "./App.css";
import React from "react";

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

const App = () => {
  // Destructure custom hooks to get functions for generating URL and uploading images to S3
  const { generateUrl, uploadImage: uploadTos3 } = useImageApi();

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
            handlePaste(view, event) {
              try {
                console.log("Paste event triggered");
                const clipboardData = event.clipboardData;
                console.log("Clipboard data:", {
                  types: Array.from(clipboardData.types),
                  items: Array.from(clipboardData.items).map((item) => ({
                    kind: item.kind,
                    type: item.type,
                  })),
                });

                if (clipboardData) {
                  const html = clipboardData.getData("text/html");
                  console.log("Pasted HTML content:", html);

                  if (html) {
                    const tempDiv = document.createElement("div");
                    tempDiv.innerHTML = html;

                    const images = tempDiv.querySelectorAll("img");
                    console.log(
                      `Found ${images.length} images in pasted content`
                    );

                    images.forEach(async (img, index) => {
                      try {
                        const src = img.src;
                        console.log(`Processing image ${index + 1}:`, src);

                        if (src.startsWith("file://")) {
                          console.log(
                            `Image ${index + 1} is a local file:`,
                            src
                          );

                          const fileItem = Array.from(clipboardData.items).find(
                            (item) => item.kind === "file"
                          );

                          if (fileItem) {
                            const file = fileItem.getAsFile();
                            console.log("Found file in clipboard:", file);

                            if (file) {
                              try {
                                const imageUrl = await uploadImage(file);
                                console.log(
                                  "Upload successful, URL:",
                                  imageUrl
                                );

                                if (imageUrl) {
                                  const transaction =
                                    view.state.tr.replaceSelectionWith(
                                      view.state.schema.nodes.image.create({
                                        src: imageUrl,
                                      })
                                    );
                                  view.dispatch(transaction);
                                } else {
                                  console.error(
                                    "Upload completed but no URL returned"
                                  );
                                }
                              } catch (uploadError) {
                                console.error(
                                  "Error uploading image:",
                                  uploadError
                                );
                              }
                            } else {
                              console.error(
                                "File object could not be created from clipboard item"
                              );
                            }
                          } else {
                            console.error("No file found in clipboard items");
                          }
                        } else if (
                          src.startsWith("data:image/") ||
                          src.startsWith("http")
                        ) {
                          console.log(
                            `Processing remote image: ${src.substring(
                              0,
                              100
                            )}...`
                          );
                          try {
                            // const transaction =
                            //   view.state.tr.replaceSelectionWith(
                            //     view.state.schema.nodes.image.create({ src })
                            //   );
                            // view.dispatch(transaction);
                            console.log("Remote image inserted successfully");
                          } catch (remoteError) {
                            console.error(
                              "Error inserting remote image:",
                              remoteError
                            );
                          }
                        }
                      } catch (imgError) {
                        console.error(
                          `Error processing image ${index + 1}:`,
                          imgError
                        );
                      }
                    });

                    try {
                      const fragment = DOMParser.fromSchema(
                        view.state.schema
                      ).parse(tempDiv);
                      const transaction =
                        view.state.tr.replaceSelectionWith(fragment);
                      view.dispatch(transaction);
                      console.log("Content inserted successfully");
                    } catch (parseError) {
                      console.error(
                        "Error parsing and inserting content:",
                        parseError
                      );
                    }

                    event.preventDefault();
                    return true;
                  }

                  // Handle direct image files
                  for (let i = 0; i < clipboardData.items.length; i++) {
                    try {
                      const item = clipboardData.items[i];
                      console.log(`Processing clipboard item ${i}:`, item.type);

                      if (item.type.includes("image")) {
                        const file = item.getAsFile();
                        if (file) {
                          console.log("Processing image file:", file);
                          const reader = new FileReader();

                          reader.onerror = (error) => {
                            console.error("FileReader error:", error);
                          };

                          reader.onload = async () => {
                            try {
                              const base64Image = reader.result;
                              console.log("Image data loaded:", {
                                size: file.size,
                                type: file.type,
                                name: file.name,
                                base64Preview:
                                  base64Image.substring(0, 100) + "...",
                              });

                              // First insert the base64 image for immediate preview
                              const insertImage = (
                                view,
                                imageUrl,
                                altText = ""
                              ) => {
                                const image =
                                  view.state.schema.nodes.image.create({
                                    src: imageUrl,
                                    alt: altText,
                                    title: altText,
                                  });

                                const transaction =
                                  view.state.tr.replaceSelectionWith(image);
                                view.dispatch(transaction);
                              };

                              // Then upload and replace with the actual URL
                              const imageUrl = await uploadImage(file);
                              if (imageUrl) {
                                insertImage(
                                  view,
                                  imageUrl,
                                  file.name || "Pasted image"
                                );
                                console.log(
                                  "Image inserted into editor with URL:",
                                  imageUrl
                                );
                              }
                            } catch (error) {
                              console.error("Error processing image:", error);
                            }
                          };

                          // Read as data URL to get base64 representation
                          reader.readAsDataURL(file);
                          event.preventDefault(); // Prevent the default paste behavior
                        }
                      }
                    } catch (error) {
                      console.error("Error processing clipboard item:", error);
                    }
                  }
                }
              } catch (error) {
                console.error("Error handling paste event:", error);
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
