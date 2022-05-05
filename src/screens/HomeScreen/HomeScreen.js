import React, { useEffect, useState } from 'react';
import { FlatList, Keyboard, Text, TextInput, TouchableOpacity, View } from 'react-native';
import styles from './styles';
import axios from "axios";
import { collection, query, where, doc, getDoc, getDocs, addDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useNavigation } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

const Stack = createStackNavigator();

export default function HomeScreen(props) {
    // Loading variable to fetch data
    const [loading, setLoading] = useState(true);

    // Used in Adding/Leaving a house in onAddButtonPress function
    const [entityTextAdd, setEntityTextAdd] = useState('');
    const [entityTextCreate, setEntityTextCreate] = useState('');

    // Used to display houses that a user is a member of
    const [entities, setEntities] = useState([]);
    
    // Used in fetchData function 
    const [entranceData, setEntranceData] = useState({});
    const [entranceChangeID, setEntranceChangeID] = useState('1');

    // Populate entityRef (houses collection reference for house entities with matching houseIDs)
    const userID = props.extraData.id;
    const userName = props.extraData.fullName;

    const userRef = doc(db, 'users', `${userID}`); // User reference for firebase access
    const colRef = collection(db, 'users', `${userID}`, 'houseIDs'); // Collection reference for a specific user's houseIDs collection for firebase access
    const houseColRef = collection(db, 'houses'); // Collection reference for houses collection for firebase access

    // Use the navigation from App.js
    const navigation = useNavigation();

    useEffect(() => {
        // Modify UI
        navigation.setOptions({
            headerStyle: { backgroundColor: '#01949A' }
        });

        // Function to fetch data from webhook.site of new entrance update
        const fetchData = async () => {
            // GET request sent to webhook.site using unique token generated by webhook.site 
            //fetch('http://webhook.site/token/007347fc-f34d-4286-88d8-a10bbb8b2292/request/latest')
            setLoading(true);
            try{
                const response = await axios.get('http://webhook.site/token/007347fc-f34d-4286-88d8-a10bbb8b2292/request/latest');
                // If there is no new data to be handled, then do nothing
                var values = JSON.parse(response.data.content);
                console.log("entranceChangeID before if:", entranceChangeID);
                console.log("response.data.uuid", response.data.uuid);
                if(entranceChangeID != response.data.uuid){
                    var data = {
                        name: values.value2,
                        status: values.value1,
                        created_at: response.data.created_at,
                        token_id: response.data.token_id,
                        changed: true
                    };
                    setEntranceData(data);
                    setEntranceChangeID(response.data.uuid);
                    console.log("entranceChangeID != response.data.uuid. Now we set it:", entranceChangeID);
                    console.log("New update jus dropped: ", entranceData);
                }
                else {
                    var data = {
                        name: values.value2,
                        status: values.value1,
                        created_at: response.data.created_at,
                        token_id: response.data.token_id,
                        changed: false
                    };
                    setEntranceData(data);
                    setEntranceChangeID(response.data.uuid);
                    console.log("No new entrance data to handle, changed flag set to false: ", entranceData);
                }
            } catch (error) {
                console.error(error.message);
            }
            setLoading(false);
        }

        // Getting and returning house objects to populate newEntities in parent calling function
        function getHousesForEachPost(houseIDDocSnaps) {
            return Promise.all(
                houseIDDocSnaps.map(async (houseIDDocSnap) => {
                    const houseData = houseIDDocSnap.data();

                    const houseDocRef = doc(db, 'houses', houseData.houseID);
                    const houseDocSnap = await getDoc(houseDocRef);
            
                    return {
                        id: houseIDDocSnap.id,
                        ...houseDocSnap.data(),
                    };
                })
            )
        }

        //Get the latest update on an entrance via the site 
        //update = setInterval(fetchData, 30000)
        fetchData();

        let cancelPreviousPromiseChain = undefined;
        // Snapshot of houseIDs collection in users object 
        const unsubscribe = onSnapshot(colRef, 
            (snapshot) => {
                if(cancelPreviousPromiseChain) cancelPreviousPromiseChain(); // Cancel previous run if possible

                let cancelled = false; 
                cancelPreviousPromiseChain = () => cancelled = true;

                getHousesForEachPost(snapshot.docs)
                .then((entitiesArray) => {
                    if(cancelled) return; // cancelled, do nothing
                    setLoading(false);
                    setEntities(entitiesArray);
                })
                .catch((error) => {
                    if(cancelled) return; // cancelled, do nothing
                    setLoading(false);
                    console.log(error);
                })
            }, 
            (error) => {
                if(cancelPreviousPromiseChain) cancelPreviousPromiseChain(); // Now the listener has errored, cancel using any stale data
                setLoading(false);
                console.log(error);
            }
        );

        return () => {
            unsubscribe(); // detaches the listener
        }
    }, []);

    const onAddButtonPress = async () => {
        // Adding an existing house
        if(entityTextAdd && entityTextAdd.length > 0) {
            const houseRef = query(collection(db, 'houses'), where('houseID', '==', `${entityTextAdd}`));
            const houseSnapshot = await getDocs(houseRef);
            
            if(!houseSnapshot.empty) { // If the house reference exists, set the user doc to have the houseID
                const data = {
                    houseID: entityTextAdd, // Used in displaying houses a user is a member of
                    fullName: userName // Used in displaying member users in a house
                };
                const houseIDsDocRef = doc(db, 'users', `${userID}`, 'houseIDs', `${entityTextAdd}`);
                setDoc(houseIDsDocRef, data)
                    .then(_doc => {
                        setEntityTextAdd('');
                        Keyboard.dismiss();
                        alert("Joined existing house");
                    })
                    .catch((error) => {
                        alert(error);
                    });
            }
            else {
                setEntityTextAdd('');
                alert("No existing house. \nPlease enter the HouseID of an existing house or use the Create button to create a new one.");
            }
        }
    }

    const onCreateButtonPress = async () => {
        // Creating a new house
        if(entityTextCreate && entityTextCreate.length > 0) {
            const q = query(houseColRef, where('name', '==', `${entityTextCreate}`));
            const houseQuerySnapshot = await getDocs(q);
            
            if(houseQuerySnapshot.empty) { // If query snapshot is empty, we create a new houseID and house
                const houseDocRef = await addDoc(houseColRef, { name: entityTextCreate }); // Create a new doc in users houseIDs subcol
                const houseData = { // data for new house doc
                    houseID: houseDocRef.id,
                    name: entityTextCreate,
                    ownerID: userID
                };
                await setDoc(houseDocRef, houseData) // set data of the new house 
                    .then(_doc => {
                        setEntityTextCreate('');
                        Keyboard.dismiss();
                        console.log("Created new house", houseData.name);
                    })
                    .catch((error) => alert(error));

                const houseIDsDocRef = doc(db, 'users', `${userID}`, 'houseIDs', `${houseDocRef.id}`); // users houseIDs subcol reference
                await setDoc(houseIDsDocRef, { // set data of new houseIDs document
                    houseID: houseDocRef.id,
                })
                    .then(() => {
                        alert("New house created and joined:", houseDocRef.id);
                    })
                    .catch((error) => alert(error));
            }
            else {
                setEntityTextCreate('');
                alert("No existing house. \nPlease enter the HouseID of an existing house or use the Create button to create a new one.");
            }
        }
    }

    const onLeaveHouseButtonPress = () => {
        console.log("LEAVE HOUSE BUTTON PRESSED")
    }

    const renderEntity = ({item, index}) => {
        return (
            <View style={{flexDirection: 'row', alignItems: 'center'}}>
                <TouchableOpacity style={styles.entityContainer} onPress={() => {
                    navigation.navigate('Houses', {
                        houseID: item.houseID,
                        name: item.name,
                        ownerID: item.ownerID,
                        headerStyle: {
                            backgroundColor: '#81B622',
                        },
                        headerTintColor: 'black',
                        extraData: props.extraData
                    })
                }}>
                    <View>
                        <Text style={styles.entityTextName}>
                            {item.name} 
                        </Text>
                        <Text style={styles.entityTextID}>HouseID:</Text>
                        <Text style={styles.entityText} selectable={true}>{item.houseID}</Text>
                    </View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.leaveEntityContainer} onPress={onLeaveHouseButtonPress}>
                    <Text style={styles.leaveEntityText}>Leave</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('Notifications')}>
                    <Text style={styles.buttonText}>Notifications</Text>
            </TouchableOpacity> */}
            <View style={styles.formContainer}>
                <TextInput
                    style={styles.input}
                    placeholder='House ID of an existing house'
                    placeholderTextColor="#aaaaaa"
                    onChangeText={(text) => setEntityTextAdd(text)}
                    value={entityTextAdd}
                    underlineColorAndroid="transparent"
                    autoCapitalize="none"
                />
                <TouchableOpacity style={styles.button} onPress={onAddButtonPress}>
                    <Text style={styles.buttonText}>Add</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.formContainer}>
                <TextInput
                    style={styles.input}
                    placeholder='Name your new house?'
                    placeholderTextColor="#aaaaaa"
                    onChangeText={(text) => setEntityTextCreate(text)}
                    value={entityTextCreate}
                    underlineColorAndroid="transparent"
                    autoCapitalize="none"
                />
                <TouchableOpacity style={styles.button} onPress={onCreateButtonPress}>
                    <Text style={styles.buttonText}>Create</Text>
                </TouchableOpacity>
            </View>
            {loading && <Text>Loading</Text>}
            { !loading && (entities && (
                <View style={styles.listContainer}>
                    <View style={styles.header}> 
                        <Text style={styles.headerText}>{userName}'s Houses</Text>
                    </View>
                    <FlatList
                        style={styles.flatList}
                        data={entities}
                        renderItem={renderEntity}
                        keyExtractor={(item) => item.id}
                        removeClippedSubviews={true}
                        ListHeaderComponent={()=> {
                            return (
                                <View style={styles.listHeader}> 
                                    <Text style={styles.headerText}>{"(Tap on a House to view its details!)"}</Text> 
                                </View>
                            )
                        }}
                    />
                </View>)
            )}
        </View>
    );
}